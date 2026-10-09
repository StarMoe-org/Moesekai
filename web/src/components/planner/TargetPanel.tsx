"use client";
import { useMemo, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Chip, Surface } from "@/components/md3";
import { estimateRank } from "@/lib/goal-planner/core";
import type { RankEstimate, TierPoint } from "@/lib/goal-planner/types";

export const DEFAULT_TARGET_TIER = 1000;

export interface TargetValue {
    /** null = custom target score. */
    targetTier: number | null;
    targetScore: number;
    currentScore: number;
    currentScoreEdited: boolean;
}

export interface TimeValue {
    dailyManualHours: number;
    dailyAutoRuns: number;
}

export interface TargetPanelProps {
    /** Current score per tier from the ranking API. */
    tiers: TierPoint[];
    /** Final score per tier: model predictions, or the finals once the scope has ended. */
    predictedTiers: TierPoint[];
    hasBorderData: boolean;
    value: TargetValue;
    onChange(v: TargetValue): void;
    dailyManualHours: number;
    dailyAutoRuns: number;
    autoDailyLimit: number;
    onTimeChange(v: TimeValue): void;
}

export function defaultTargetValue(): TargetValue {
    return { targetTier: DEFAULT_TARGET_TIER, targetScore: 0, currentScore: 0, currentScoreEdited: false };
}

/** Target tiers are the ranks with a known final: a model prediction, or the final itself once the scope has ended. */
function targetRanks(predictedTiers: readonly TierPoint[]): number[] {
    return [...new Set(predictedTiers.map((point) => point.rank))].sort((a, b) => a - b);
}

function scoreAt(points: readonly TierPoint[], rank: number): number | null {
    return points.find((point) => point.rank === rank)?.score ?? null;
}

function nearestRank(ranks: readonly number[], rank: number): number {
    let best = ranks[0];
    for (const candidate of ranks) {
        if (Math.abs(Math.log(candidate / rank)) < Math.abs(Math.log(best / rank))) best = candidate;
    }
    return best;
}

/**
 * Applies the follow rules: a selected tier sets the target to its predicted final, and the current score tracks
 * that tier's current score until the user edits it. A current score is never taken as a final: the caller passes
 * the current scores as predictedTiers once the scope has ended. A tier without a final snaps to the nearest tier
 * that has one; with none the target becomes custom.
 */
export function resolveTargetValue(
    value: TargetValue,
    tiers: readonly TierPoint[],
    predictedTiers: readonly TierPoint[],
): TargetValue {
    if (value.targetTier == null) return value;
    const ranks = targetRanks(predictedTiers);
    if (ranks.length === 0) return { ...value, targetTier: null };

    const targetTier = ranks.includes(value.targetTier) ? value.targetTier : nearestRank(ranks, value.targetTier);
    const current = scoreAt(tiers, targetTier);
    const targetScore = scoreAt(predictedTiers, targetTier) ?? 0;
    const currentScore = value.currentScoreEdited ? value.currentScore : (current ?? value.currentScore);
    if (targetTier === value.targetTier && targetScore === value.targetScore && currentScore === value.currentScore) {
        return value;
    }
    return { ...value, targetTier, targetScore, currentScore };
}

const RANK_KEYS = {
    current: "page.predictionPlanner.target.currentRank",
    predicted: "page.predictionPlanner.target.predictedRank",
} as const;

const INPUT_CLASS =
    "focus-ring h-10 w-full px-3 bg-surface-container-low border border-outline rounded-md3-md type-body-m tabular-nums text-on-surface caret-primary hover:border-on-surface focus:border-primary transition-colors duration-150 ease-md3-standard";
const LABEL_CLASS = "block type-label-l text-on-surface-variant mb-1.5";
/** Chips share the row on phones so each keeps a usable tap size in the half-width column. */
const CHIP_ROW_CLASS = "mt-1.5 flex gap-1.5";
const CHIP_CLASS = "flex-1 min-w-0 sm:flex-none [&>button]:w-full [&>button]:min-w-0 [&>button]:justify-center [&>button]:px-2 [&>button]:font-mono";

const HOUR_CHIPS = [2, 4, 6, 8, 12, 16, 24];
/** Seven hour chips wrap to two rows of four in the half-width phone column. */
const HOUR_CHIP_ROW_CLASS = "mt-1.5 grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap";

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

interface NumberFieldProps {
    id: string;
    value: number;
    onValueChange(value: number): void;
    decimal?: boolean;
    emptyWhenZero?: boolean;
    placeholder?: string;
    className?: string;
}

/** Shows the formatted number; only while focused are the raw digits edited, so the caret does not jump. */
function NumberField({ id, value, onValueChange, decimal = false, emptyWhenZero = false, placeholder, className }: NumberFieldProps) {
    const { formatNumber } = useI18n();
    const [draft, setDraft] = useState<string | null>(null);
    const shown = emptyWhenZero && value === 0 ? "" : formatNumber(value, { maximumFractionDigits: decimal ? 1 : 0 });
    return (
        <input
            id={id}
            type="text"
            inputMode={decimal ? "decimal" : "numeric"}
            autoComplete="off"
            value={draft ?? shown}
            placeholder={placeholder}
            onFocus={() => setDraft(emptyWhenZero && value === 0 ? "" : String(value))}
            onBlur={() => setDraft(null)}
            onChange={(event) => {
                const raw = decimal
                    ? event.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
                    : event.target.value.replace(/\D/g, "");
                const text = raw.slice(0, 15);
                setDraft((current) => (current === null ? null : text));
                const parsed = decimal ? Number.parseFloat(text) : Number.parseInt(text, 10);
                onValueChange(Number.isFinite(parsed) ? parsed : 0);
            }}
            className={className ?? INPUT_CLASS}
        />
    );
}

export default function TargetPanel({
    tiers,
    predictedTiers,
    hasBorderData,
    value,
    onChange,
    dailyManualHours,
    dailyAutoRuns,
    autoDailyLimit,
    onTimeChange,
}: TargetPanelProps) {
    const { t, formatNumber } = useI18n();
    const ranks = useMemo(() => targetRanks(predictedTiers), [predictedTiers]);

    const currentEstimate = useMemo<RankEstimate | null>(
        () => (hasBorderData && tiers.length > 0 ? estimateRank(value.currentScore, tiers) : null),
        [hasBorderData, tiers, value.currentScore],
    );
    const predictedEstimate = useMemo<RankEstimate | null>(
        () => (value.targetTier == null && value.targetScore > 0 && predictedTiers.length > 0
            ? estimateRank(value.targetScore, predictedTiers)
            : null),
        [value.targetTier, value.targetScore, predictedTiers],
    );
    const reachedTier = currentEstimate?.reachedTier ?? null;

    const rankLine = (estimate: RankEstimate, kind: keyof typeof RANK_KEYS) => {
        if (estimate.rank != null) {
            return t(RANK_KEYS[kind], { rank: formatNumber(Math.max(1, Math.round(estimate.rank))) });
        }
        return estimate.outside === "above"
            ? t("page.predictionPlanner.target.currentRankAbove")
            : t("page.predictionPlanner.target.currentRankBelow");
    };

    const selectTier = (rank: number) => {
        onChange({ ...value, targetTier: rank, currentScoreEdited: false });
    };

    const autoChips = [...new Set([0, Math.min(10, autoDailyLimit), autoDailyLimit])];

    return (
        <Surface as="section" tone="card" radius="lg" className="p-4 sm:p-6 space-y-5">
            <div className="space-y-4">
                <h2 className="type-title-l text-on-surface">
                    {t("page.predictionPlanner.target.title")}
                </h2>

                <div>
                    <span className={LABEL_CLASS}>{t("page.predictionPlanner.target.tier")}</span>
                    <div className="grid grid-cols-4 min-[380px]:grid-cols-5 sm:grid-cols-8 gap-1.5">
                        {ranks.map((rank) => {
                            const selected = value.targetTier === rank;
                            const reached = reachedTier === rank;
                            return (
                                <Chip
                                    key={rank}
                                    selected={selected}
                                    showCheckmark={false}
                                    onClick={() => selectTier(rank)}
                                    className={`min-w-0 [&>button]:w-full [&>button]:min-w-0 [&>button]:justify-center [&>button]:px-1 [&>button]:font-mono ${reached
                                        ? selected
                                            ? "rounded-md3-sm ring-2 ring-tertiary"
                                            : "[&>button]:bg-tertiary-container [&>button]:text-on-tertiary-container [&>button]:border-tertiary"
                                        : ""
                                        }`}
                                >
                                    {t("page.predictionPlanner.target.tierOption", { rank })}
                                </Chip>
                            );
                        })}
                        <Chip
                            selected={value.targetTier == null}
                            showCheckmark={false}
                            onClick={() => onChange({ ...value, targetTier: null })}
                            className="col-span-2 min-w-0 [&>button]:w-full [&>button]:justify-center"
                        >
                            {t("page.predictionPlanner.target.custom")}
                        </Chip>
                    </div>

                    {value.targetTier != null ? (
                        value.targetScore > 0 && (
                            <p className="mt-2 type-label-l tabular-nums text-tertiary">
                                {t("page.predictionPlanner.target.predictedFinal", { score: formatNumber(value.targetScore) })}
                            </p>
                        )
                    ) : (
                        <div className="mt-2">
                            <label htmlFor="planner-target-score" className="sr-only">
                                {t("page.predictionPlanner.target.custom")}
                            </label>
                            <NumberField
                                id="planner-target-score"
                                value={value.targetScore}
                                emptyWhenZero
                                placeholder={t("page.predictionPlanner.target.customPlaceholder")}
                                onValueChange={(targetScore) => onChange({ ...value, targetScore })}
                                className={`${INPUT_CLASS} text-tertiary`}
                            />
                            {predictedEstimate && (
                                <p className="mt-1.5 type-body-s text-on-surface-variant">
                                    {rankLine(predictedEstimate, "predicted")}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div>
                    <label htmlFor="planner-current-score" className={LABEL_CLASS}>
                        {t("page.predictionPlanner.target.currentScore")}
                    </label>
                    <NumberField
                        id="planner-current-score"
                        value={value.currentScore}
                        onValueChange={(currentScore) => onChange({ ...value, currentScore, currentScoreEdited: true })}
                    />
                    <p className="mt-1.5 type-body-s text-on-surface-variant">
                        {currentEstimate
                            ? rankLine(currentEstimate, "current")
                            : t("page.predictionPlanner.target.noBorderData")}
                    </p>
                </div>
            </div>

            <div className="pt-4 border-t border-outline-variant space-y-3">
                <h3 className="type-title-m text-on-surface">{t("page.predictionPlanner.time.title")}</h3>
                <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                        <label htmlFor="planner-daily-hours" className={LABEL_CLASS}>
                            {t("page.predictionPlanner.time.dailyManualHours")}
                        </label>
                        <div className="relative">
                            <NumberField
                                id="planner-daily-hours"
                                decimal
                                value={dailyManualHours}
                                onValueChange={(hours) => onTimeChange({ dailyManualHours: clamp(hours, 0, 24), dailyAutoRuns })}
                                className={`${INPUT_CLASS} pr-12`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 type-label-m text-on-surface-variant pointer-events-none">
                                {t("page.predictionPlanner.time.hoursUnit")}
                            </span>
                        </div>
                        <div className={HOUR_CHIP_ROW_CLASS}>
                            {HOUR_CHIPS.map((hours) => (
                                <Chip
                                    key={hours}
                                    selected={dailyManualHours === hours}
                                    showCheckmark={false}
                                    onClick={() => onTimeChange({ dailyManualHours: hours, dailyAutoRuns })}
                                    className={CHIP_CLASS}
                                >
                                    {formatNumber(hours)}
                                </Chip>
                            ))}
                        </div>
                    </div>
                    <div className="min-w-0">
                        <label htmlFor="planner-daily-auto" className={LABEL_CLASS}>
                            {t("page.predictionPlanner.time.dailyAuto")}
                        </label>
                        <div className="relative">
                            <NumberField
                                id="planner-daily-auto"
                                value={dailyAutoRuns}
                                onValueChange={(runs) => onTimeChange({ dailyManualHours, dailyAutoRuns: clamp(Math.round(runs), 0, autoDailyLimit) })}
                                className={`${INPUT_CLASS} pr-10`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 type-label-m text-on-surface-variant pointer-events-none">
                                {t("page.predictionPlanner.time.autoUnit")}
                            </span>
                        </div>
                        <div className={CHIP_ROW_CLASS}>
                            {autoChips.map((runs) => (
                                <Chip
                                    key={runs}
                                    selected={dailyAutoRuns === runs}
                                    showCheckmark={false}
                                    onClick={() => onTimeChange({ dailyManualHours, dailyAutoRuns: runs })}
                                    className={CHIP_CLASS}
                                >
                                    {formatNumber(runs)}
                                </Chip>
                            ))}
                        </div>
                        <p className="mt-1 type-body-s text-on-surface-variant">
                            {t("page.predictionPlanner.time.autoLimit", { count: autoDailyLimit })}
                        </p>
                    </div>
                </div>
            </div>
        </Surface>
    );
}
