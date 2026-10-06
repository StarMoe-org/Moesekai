"use client";
import { useI18n } from "@/contexts/I18nContext";
import { List, Surface } from "@/components/md3";
import { getCharacterName } from "@/lib/i18n";
import type { EventRules } from "@/lib/event-rules/types";
import type { Feasibility, PlannerResult, SongComparison } from "@/lib/goal-planner/types";

export interface ResultsPanelProps {
    result: PlannerResult | null;
    comparison: SongComparison | null;
    rules: EventRules;
}

const FEASIBILITY: Record<Feasibility, { key: string; badge: string; value: string; tile: string }> = {
    comfortable: {
        key: "page.predictionPlanner.results.feasibility.comfortable",
        badge: "bg-secondary-container text-on-secondary-container border-transparent",
        value: "text-on-secondary-container",
        tile: "border-transparent bg-secondary-container text-on-secondary-container",
    },
    achievable: {
        key: "page.predictionPlanner.results.feasibility.achievable",
        badge: "bg-primary-container text-on-primary-container border-transparent",
        value: "text-on-primary-container",
        tile: "border-transparent bg-primary-container text-on-primary-container",
    },
    hard: {
        key: "page.predictionPlanner.results.feasibility.hard",
        badge: "bg-tertiary-container text-on-tertiary-container border-transparent",
        value: "text-on-tertiary-container",
        tile: "border-transparent bg-tertiary-container text-on-tertiary-container",
    },
    impossible: {
        key: "page.predictionPlanner.results.feasibility.impossible",
        badge: "bg-error-container text-on-error-container border-transparent",
        value: "text-on-error-container",
        tile: "border-transparent bg-error-container text-on-error-container",
    },
};

/**
 * Switch tips: perStamina and perHour trade stamina against time; both saves stamina and time;
 * timeOnly and staminaOnly save one at an equal cost in the other.
 */
interface ComparisonTip {
    kind: "perStamina" | "perHour" | "both" | "timeOnly" | "staminaOnly";
    key: string;
    song: string;
    stamina: number;
    perDay: number;
    total: number;
}

/** Hour deltas this small are float noise between plans that take the same time. */
const SAME_HOURS = 1e-6;
/** Below this many hours left the panel drops per-day figures (D3). */
const DAY_HOURS = 24;

const TILE = "p-3.5 rounded-md3-md border min-w-0";
const NEUTRAL_TILE = "bg-surface-container-highest text-on-surface border-outline-variant";
const TILE_LABEL = "block type-label-m mb-1";
const TILE_VALUE = "block type-title-m type-emphasized font-mono break-words";
/** Values that mix CJK text with numbers read better in the body font. */
const TILE_TEXT_VALUE = "block type-title-m type-emphasized tabular-nums break-words";
const TILE_SUB = "block mt-1 type-body-s break-words";

export default function ResultsPanel({ result, comparison, rules }: ResultsPanelProps) {
    const { t, formatNumber } = useI18n();
    const hours = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const staminaParams = (stamina: number) => ({
        stamina: formatNumber(stamina),
        drinks: formatNumber(Math.ceil(stamina / 10)),
        crystals: formatNumber(stamina * 10),
    });

    const style = result ? FEASIBILITY[result.feasibility] : null;
    const reached = result != null && result.gap <= 0;
    const remainingHours = result ? Math.max(0, result.remainingHours) : 0;
    const underDay = remainingHours < DAY_HOURS;
    const gaugeCap = result?.gaugeCapHoursPerDay ?? null;
    // Core reports 24 when the gauge does not bind within the time left.
    const showGaugeCap = gaugeCap != null && gaugeCap < DAY_HOURS;
    // Undoes core's per-day pro-rating (hours / max(days, 1/24)) to get the gauge hours in the time left.
    const gaugeCapLeftHours = gaugeCap != null ? (gaugeCap * Math.max(remainingHours, 1)) / DAY_HOURS : 0;

    const tips: ComparisonTip[] = [];
    const staminaPick = comparison?.bestPerStamina;
    const staminaDelta = comparison?.perStaminaDelta;
    if (staminaPick && staminaDelta && staminaDelta.staminaSaved > 0) {
        const { hoursPerDayMore, hoursTotalMore } = staminaDelta;
        const kind = hoursPerDayMore > SAME_HOURS ? "perStamina" : hoursPerDayMore < -SAME_HOURS ? "both" : "staminaOnly";
        tips.push({
            kind,
            key: staminaPick.key,
            song: staminaPick.label,
            stamina: staminaDelta.staminaSaved,
            perDay: Math.abs(hoursPerDayMore),
            total: Math.abs(hoursTotalMore),
        });
    }
    const hourPick = comparison?.bestPerHour;
    const hourDelta = comparison?.perHourDelta;
    if (hourPick && hourDelta && hourDelta.hoursPerDaySaved > SAME_HOURS) {
        const { staminaMore } = hourDelta;
        const kind = staminaMore > 0 ? "perHour" : staminaMore < 0 ? "both" : "timeOnly";
        const sameTip = kind === "both" && tips.some((tip) => tip.kind === "both" && tip.key === hourPick.key);
        if (!sameTip) {
            tips.push({
                kind,
                key: hourPick.key,
                song: hourPick.label,
                stamina: Math.abs(staminaMore),
                perDay: hourDelta.hoursPerDaySaved,
                total: hourDelta.hoursTotalSaved,
            });
        }
    }
    // Under a day left the tips name total hours only, like the headline (D3).
    const tipText = (tip: ComparisonTip) => {
        const values = { song: tip.song, perDay: hours(tip.perDay), total: hours(tip.total) };
        switch (tip.kind) {
            case "perHour": {
                const params = { ...values, stamina: formatNumber(tip.stamina) };
                return underDay
                    ? t("page.predictionPlanner.comparison.perHourTotal", params)
                    : t("page.predictionPlanner.comparison.perHour", params);
            }
            case "both": {
                const params = { ...values, ...staminaParams(tip.stamina) };
                return underDay
                    ? t("page.predictionPlanner.comparison.bothTotal", params)
                    : t("page.predictionPlanner.comparison.both", params);
            }
            case "timeOnly":
                return underDay
                    ? t("page.predictionPlanner.comparison.timeOnlyTotal", values)
                    : t("page.predictionPlanner.comparison.timeOnly", values);
            case "staminaOnly":
                return t("page.predictionPlanner.comparison.staminaOnly", { song: tip.song, ...staminaParams(tip.stamina) });
            default: {
                const params = { ...values, ...staminaParams(tip.stamina) };
                return underDay
                    ? t("page.predictionPlanner.comparison.perStaminaTotal", params)
                    : t("page.predictionPlanner.comparison.perStamina", params);
            }
        }
    };

    const showChapters = result != null && !reached && rules.group === "wl_overall" && result.perChapter.length > 0;

    return (
        <Surface as="section" tone="card" radius="lg" className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="type-title-l text-on-surface">
                    {t("page.predictionPlanner.results.title")}
                </h2>
                {style && result && (
                    <span className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-md3-sm border type-label-l ${style.badge}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {t(style.key)}
                    </span>
                )}
            </div>

            {!result ? (
                <p className="type-body-m font-mono text-on-surface-variant">—</p>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className={`${TILE} ${NEUTRAL_TILE}`}>
                            <span className={TILE_LABEL}>{t("page.predictionPlanner.results.gap")}</span>
                            <span className={`${TILE_VALUE} ${reached ? "text-tertiary" : "text-on-surface"}`}>
                                {reached ? t("page.predictionPlanner.results.reached") : formatNumber(result.gap)}
                            </span>
                            <span className={TILE_SUB}>
                                {underDay
                                    ? t("page.predictionPlanner.results.remainingHours", { hours: hours(remainingHours) })
                                    : t("page.predictionPlanner.results.remaining", {
                                        days: Math.floor(remainingHours / 24),
                                        hours: Math.floor(remainingHours % 24),
                                    })}
                            </span>
                        </div>

                        {!reached && style && (
                            <div className={`${TILE} ${style.tile}`}>
                                <span className={TILE_LABEL}>
                                    {underDay ? t("page.predictionPlanner.results.manualNeeded") : t("page.predictionPlanner.results.dailyManual")}
                                </span>
                                <span className={`${TILE_TEXT_VALUE} ${style.value}`}>
                                    {underDay
                                        ? t("page.predictionPlanner.results.manualNeededValue", {
                                            total: hours(result.manualHoursTotal),
                                            limit: hours(result.manualLimitHours),
                                        })
                                        : t("page.predictionPlanner.results.dailyManualValue", {
                                            perDay: hours(result.manualHoursPerDay),
                                            total: hours(result.manualHoursTotal),
                                        })}
                                </span>
                                <span className={TILE_SUB}>
                                    {t("page.predictionPlanner.results.manualPlays", { count: formatNumber(result.manualPlays) })}
                                </span>
                                <span className={TILE_SUB}>
                                    {/* Under a day the headline compares hours, and Auto takes real time too. */}
                                    {underDay && result.autoRuns > 0
                                        ? t("page.predictionPlanner.results.autoRunsTime", {
                                            count: formatNumber(result.autoRuns),
                                            pt: formatNumber(result.autoTotalPt),
                                            hours: hours(result.autoHoursTotal),
                                        })
                                        : t("page.predictionPlanner.results.autoRuns", {
                                            count: formatNumber(result.autoRuns),
                                            pt: formatNumber(result.autoTotalPt),
                                        })}
                                </span>
                                {showGaugeCap && (
                                    <span className={TILE_SUB}>
                                        {underDay
                                            ? t("page.predictionPlanner.results.gaugeCapLeft", { hours: hours(gaugeCapLeftHours) })
                                            : t("page.predictionPlanner.results.gaugeCap", { hours: hours(gaugeCap) })}
                                    </span>
                                )}
                            </div>
                        )}

                        {!reached && (
                            <div className={`${TILE} ${NEUTRAL_TILE} sm:col-span-2`}>
                                <span className={TILE_LABEL}>{t("page.predictionPlanner.results.stamina")}</span>
                                <span className={`${TILE_TEXT_VALUE} text-tertiary`}>
                                    {t("page.predictionPlanner.results.staminaValue", {
                                        stamina: formatNumber(result.stamina),
                                        drinks: formatNumber(result.bigDrinks),
                                        crystals: formatNumber(result.crystals),
                                    })}
                                </span>
                                <span className={TILE_SUB}>
                                    {t("page.predictionPlanner.results.naturalStamina", { stamina: formatNumber(result.naturalStamina) })}
                                </span>
                            </div>
                        )}
                    </div>

                    {showChapters && (
                        <div>
                            <h3 className="type-title-s text-on-surface mb-2">
                                {t("page.predictionPlanner.results.perChapter")}
                            </h3>
                            <List className="divide-y divide-outline-variant rounded-md3-md border border-outline-variant">
                                {result.perChapter.map((chapter) => {
                                    const capped = chapter.gaugeCapHours != null && chapter.manualHours >= chapter.gaugeCapHours - 0.05;
                                    return (
                                        <li
                                            key={chapter.chapterNo}
                                            className={`px-3 py-2 type-body-m break-words ${capped ? "bg-tertiary-container text-on-tertiary-container" : "text-on-surface-variant"}`}
                                        >
                                            {t("page.predictionPlanner.results.chapterRow", {
                                                no: chapter.chapterNo,
                                                character: chapter.gameCharacterId != null ? getCharacterName(t, chapter.gameCharacterId) : "",
                                                hours: hours(chapter.manualHours),
                                                pt: formatNumber(chapter.pt),
                                            })}
                                        </li>
                                    );
                                })}
                            </List>
                        </div>
                    )}

                    {!reached && tips.length > 0 && (
                        <div className="space-y-1.5 type-body-s text-on-surface-variant">
                            {tips.map((tip) => (
                                <p key={`${tip.kind}:${tip.key}`}>{tipText(tip)}</p>
                            ))}
                        </div>
                    )}
                </>
            )}
        </Surface>
    );
}
