"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { Banner, EmptyState, LoadingIndicator, PageContainer, PageHeader } from "@/components/md3";
import PredictionEventPicker from "@/components/prediction/PredictionEventPicker";
import RulesCard from "@/components/planner/RulesCard";
import PtSourcePanel from "@/components/planner/PtSourcePanel";
import TargetPanel, {
    defaultTargetValue,
    resolveTargetValue,
    type TargetValue,
    type TimeValue,
} from "@/components/planner/TargetPanel";
import ResultsPanel from "@/components/planner/ResultsPanel";
import { useI18n } from "@/contexts/I18nContext";
import { useEventRules } from "@/hooks/useEventRules";
import { usePredictionEvent } from "@/lib/prediction/use-prediction-event";
import { compareSongs, planGoal } from "@/lib/goal-planner/core";
import { remainingChapterWindows } from "@/lib/goal-planner/chapters";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import type { RuleScope } from "@/lib/event-rules/types";
import type { PlannerInput, PtPlan, SongOption, TierPoint } from "@/lib/goal-planner/types";
import type { UsePredictionEventOptions } from "@/lib/prediction/types";
import type { RankChart, ServerType } from "@/types/prediction";

/** Offset of the region's clock from UTC; Auto counts reset at local 04:00. */
const TZ_OFFSET_MINUTES: Record<ServerType, number> = { jp: 540, cn: 480 };
const DEFAULT_DAILY_MANUAL_HOURS = 6;
/** The page clock ticks every second; plans are recomputed once a minute. */
const PLAN_CLOCK_MS = 60_000;
const DEFAULT_TARGET = defaultTargetValue();
const NO_SONG_OPTIONS: SongOption[] = [];

function parseServer(value: string | null): ServerType | undefined {
    return value === "jp" || value === "cn" ? value : undefined;
}

function parsePositiveInt(value: string | null): number | undefined {
    if (!value || !/^\d+$/.test(value)) return undefined;
    const parsed = Number(value);
    return parsed > 0 ? parsed : undefined;
}

function parseChapter(value: string | null): "overall" | number | undefined {
    return value === "overall" ? "overall" : parsePositiveInt(value);
}

function tierPoints(rows: readonly RankChart[], pick: (row: RankChart) => number): TierPoint[] {
    return rows
        .map((row) => ({ rank: row.Rank, score: pick(row) }))
        .filter((point) => Number.isFinite(point.score) && point.score > 0)
        .sort((a, b) => a.rank - b.rank);
}

function isSamePlan(a: PtPlan, b: PtPlan): boolean {
    return a === b || (
        a.manualPtPerPlay === b.manualPtPerPlay
        && a.playsPerHour === b.playsPerHour
        && a.manualFire === b.manualFire
        && a.songLabel === b.songLabel
    );
}

function PlannerContent() {
    const { t } = useI18n();
    const searchParams = useSearchParams();
    const [initialOptions] = useState<UsePredictionEventOptions>(() => ({
        initialServer: parseServer(searchParams.get("server")),
        initialEventId: parsePositiveInt(searchParams.get("event")) ?? null,
        initialChapter: parseChapter(searchParams.get("chapter")),
    }));
    const state = usePredictionEvent(initialOptions);
    const { server, selectedEventId, selectedWlChapter, setSelectedWlChapter, eventWorldBlooms, isWorldBloomEvent } = state;

    useEffect(() => {
        if (selectedEventId == null) return;
        const params = new URLSearchParams(window.location.search);
        params.set("server", server);
        params.set("event", String(selectedEventId));
        if (isWorldBloomEvent) params.set("chapter", String(selectedWlChapter));
        else params.delete("chapter");
        if (params.toString() !== new URLSearchParams(window.location.search).toString()) {
            replaceCurrentUrlSearchParams(params);
        }
    }, [server, selectedEventId, selectedWlChapter, isWorldBloomEvent]);

    const chapterCharacterId = typeof selectedWlChapter === "number"
        && eventWorldBlooms.some((chapter) => chapter.gameCharacterId === selectedWlChapter)
        ? selectedWlChapter
        : null;
    const scope = useMemo<RuleScope>(
        () => (chapterCharacterId == null ? { kind: "overall" } : { kind: "chapter", gameCharacterId: chapterCharacterId }),
        [chapterCharacterId],
    );
    const handleScopeChange = useCallback(
        (next: RuleScope) => setSelectedWlChapter(next.kind === "overall" ? "overall" : next.gameCharacterId),
        [setSelectedWlChapter],
    );
    const rulesState = useEventRules(server, selectedEventId, scope);
    const { rules } = rulesState;

    // A chapter from the URL that the event does not have falls back to the overall ranking.
    useEffect(() => {
        if (typeof selectedWlChapter !== "number" || !rules) return;
        if (rules.region !== server || rules.eventId !== selectedEventId) return;
        const known = rules.chapters.some((chapter) => chapter.gameCharacterId === selectedWlChapter)
            || eventWorldBlooms.some((chapter) => chapter.gameCharacterId === selectedWlChapter);
        if (!known) setSelectedWlChapter("overall");
    }, [rules, server, selectedEventId, selectedWlChapter, eventWorldBlooms, setSelectedWlChapter]);

    const eventKey = selectedEventId != null ? `${server}:${selectedEventId}` : "";
    const scopeKey = `${eventKey}:${chapterCharacterId ?? "overall"}`;

    const [ptState, setPtState] = useState<{ key: string; pt: PtPlan | null; songOptions: SongOption[] }>({
        key: "",
        pt: null,
        songOptions: NO_SONG_OPTIONS,
    });
    const pt = ptState.key === eventKey ? ptState.pt : null;
    const songOptions = ptState.key === eventKey ? ptState.songOptions : NO_SONG_OPTIONS;
    const handlePtChange = useCallback(
        (next: PtPlan | null, options: SongOption[]) => setPtState({ key: eventKey, pt: next, songOptions: options }),
        [eventKey],
    );

    // Target state is kept per event scope; a chosen tier carries over, scores re-follow the new scope.
    const [targetState, setTargetState] = useState<{ key: string; value: TargetValue }>({ key: "", value: DEFAULT_TARGET });
    const storedTarget = useMemo<TargetValue>(() => {
        if (targetState.key === scopeKey) return targetState.value;
        const carriedTier = targetState.value.targetTier;
        return carriedTier == null ? DEFAULT_TARGET : { ...DEFAULT_TARGET, targetTier: carriedTier };
    }, [targetState, scopeKey]);
    const handleTargetChange = useCallback(
        (value: TargetValue) => setTargetState({ key: scopeKey, value }),
        [scopeKey],
    );

    const planNow = Math.floor(state.now / PLAN_CLOCK_MS) * PLAN_CLOCK_MS;
    // A scope that has not started is planned from its start, not from the page clock.
    const planStart = rules ? Math.max(planNow, rules.scopeStartAt) : planNow;
    const scopeEnded = rules != null && planNow >= rules.scopeAggregateAt;

    const charts = state.activePredictionData?.data?.charts;
    const rankingTiers = rules?.rankingTiers;
    const { tiers, predictedTiers } = useMemo(() => {
        const rows = (charts ?? []).filter((row) => row.Rank >= 1);
        // Offer the event's reward boundaries when the API returns them, otherwise every rank it returns.
        const rewardRanks = rankingTiers && rankingTiers.length > 0 ? new Set(rankingTiers) : null;
        const rewardRows = rewardRanks ? rows.filter((row) => rewardRanks.has(row.Rank)) : rows;
        const source = rewardRows.length > 0 ? rewardRows : rows;
        const current = tierPoints(source, (row) => row.CurrentScore);
        // After aggregation the current scores are the finals; before it only model predictions count as finals.
        return {
            tiers: current,
            predictedTiers: scopeEnded ? current : tierPoints(source, (row) => row.PredictedScore),
        };
    }, [charts, rankingTiers, scopeEnded]);
    const hasBorderData = tiers.length > 0;
    const target = useMemo(
        () => resolveTargetValue(storedTarget, tiers, predictedTiers),
        [storedTarget, tiers, predictedTiers],
    );

    const [dailyManualHours, setDailyManualHours] = useState(DEFAULT_DAILY_MANUAL_HOURS);
    // null follows the event's daily Auto limit for the chosen pass.
    const [dailyAutoRunsChoice, setDailyAutoRunsChoice] = useState<number | null>(null);
    const autoDailyLimit = rules?.autoDailyLimit ?? 0;
    const dailyAutoRuns = Math.min(dailyAutoRunsChoice ?? autoDailyLimit, autoDailyLimit);
    const handleTimeChange = useCallback(
        (next: TimeValue) => {
            setDailyManualHours(next.dailyManualHours);
            if (next.dailyAutoRuns !== dailyAutoRuns) setDailyAutoRunsChoice(next.dailyAutoRuns);
        },
        [dailyAutoRuns],
    );

    const plannerInput = useMemo<PlannerInput | null>(() => {
        if (!rules || !pt || target.targetScore <= 0) return null;
        const chapters = rules.group === "wl_overall"
            ? remainingChapterWindows(rules, planStart).map((window) => ({ window, pt }))
            : undefined;
        return {
            now: planStart,
            tzOffsetMinutes: TZ_OFFSET_MINUTES[server],
            endAt: rules.scopeAggregateAt,
            currentScore: target.currentScore,
            targetScore: target.targetScore,
            pt,
            chapters,
            dailyManualHours,
            dailyAutoRuns,
            autoDailyLimit: rules.autoDailyLimit,
            gauge: rules.breakGauge.value,
        };
    }, [rules, pt, target.currentScore, target.targetScore, planStart, server, dailyManualHours, dailyAutoRuns]);
    const result = useMemo(() => (plannerInput ? planGoal(plannerInput) : null), [plannerInput]);
    const comparison = useMemo(() => {
        if (!plannerInput || !result || result.gap <= 0 || songOptions.length === 0) return null;
        const current = plannerInput.pt;
        const base = songOptions.find((option) => isSamePlan(option.pt, current))
            ?? { key: "__current", label: current.songLabel ?? "", pt: current };
        return compareSongs(base, songOptions, plannerInput);
    }, [plannerInput, result, songOptions]);

    const error = state.error;
    const rulesError = selectedEventId != null ? rulesState.error : null;
    const waitingForRules = selectedEventId != null && !rules && !rulesError;

    return (
        <PageContainer className="max-w-5xl">
            <PageHeader
                title={t("page.predictionPlanner.title")}
                description={t("page.predictionPlanner.subtitle")}
            />

            <PredictionEventPicker state={state} />

            {error && (
                <Banner tone="error" className="mb-6 break-words">{error}</Banner>
            )}
            {rulesError && (
                <Banner tone="error" title={t("common.state.loadingFailed")} className="mb-6 break-words">
                    <span className="block mt-1 type-body-s font-mono">{rulesError}</span>
                </Banner>
            )}

            {selectedEventId == null ? (
                !state.eventsLoading && (
                    <EmptyState title={t("page.predictionPlanner.noEvent")} />
                )
            ) : waitingForRules ? (
                <LoadingBlock label={t("page.predictionPlanner.loading")} />
            ) : rules && (
                <div className="space-y-4 sm:space-y-6">
                    <RulesCard
                        rules={rules}
                        overrides={rulesState.overrides}
                        onOverridesChange={rulesState.setOverrides}
                        scope={scope}
                        onScopeChange={handleScopeChange}
                        chapters={eventWorldBlooms}
                    />
                    <PtSourcePanel
                        key={eventKey}
                        rules={rules}
                        server={server}
                        eventId={selectedEventId}
                        eventType={rules.eventType}
                        chapterCharacterId={chapterCharacterId}
                        value={pt}
                        onChange={handlePtChange}
                    />
                    {state.loading ? (
                        <LoadingBlock label={t("page.predictionPlanner.loading")} />
                    ) : (
                        <TargetPanel
                            tiers={tiers}
                            predictedTiers={predictedTiers}
                            hasBorderData={hasBorderData}
                            value={target}
                            onChange={handleTargetChange}
                            dailyManualHours={dailyManualHours}
                            dailyAutoRuns={dailyAutoRuns}
                            autoDailyLimit={autoDailyLimit}
                            onTimeChange={handleTimeChange}
                        />
                    )}
                    <ResultsPanel result={result} comparison={comparison} rules={rules} />
                </div>
            )}
        </PageContainer>
    );
}

function LoadingBlock({ label }: { label: string }) {
    return (
        <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
                <LoadingIndicator size={40} aria-label={label || undefined} />
                <span className="type-body-m text-on-surface-variant">{label}</span>
            </div>
        </div>
    );
}

export default function PredictionPlannerClient() {
    return (
        <MainLayout>
            <Suspense fallback={<LoadingBlock label="" />}>
                <PlannerContent />
            </Suspense>
        </MainLayout>
    );
}
