"use client";
import React, { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Banner, Button, Chip, SegmentedButton, Surface } from "@/components/md3";
import { mdKeyboardArrowDown, mdKeyboardArrowUp, mdRefresh } from "@/components/md3/icons";
import { getCharacterName } from "@/lib/i18n";
import type {
    ColorfulPass,
    EventRules,
    RuleOverrides,
    RuleScope,
    RuleSource,
    RuleValue,
} from "@/lib/event-rules/types";
import type { WorldBloomChapterRow } from "@/lib/prediction/types";

interface RulesCardProps {
    rules: EventRules;
    overrides: RuleOverrides;
    onOverridesChange(o: RuleOverrides): void;
    scope: RuleScope;
    onScopeChange(s: RuleScope): void;
    chapters: WorldBloomChapterRow[];
}

const SOURCE_KEYS: Record<RuleSource, string> = {
    masterdata: "page.predictionPlanner.rules.source.masterdata",
    official: "page.predictionPlanner.rules.source.official",
    secondary: "page.predictionPlanner.rules.source.secondary",
    user: "page.predictionPlanner.rules.source.user",
};

const SOURCE_STYLES: Record<RuleSource, string> = {
    masterdata: "bg-surface-container-high text-on-surface-variant border-outline-variant",
    official: "bg-secondary-container text-on-secondary-container border-transparent",
    secondary: "bg-tertiary-container text-on-tertiary-container border-transparent",
    user: "bg-primary-container text-on-primary-container border-transparent",
};

const PASS_OPTIONS: ReadonlyArray<{ value: ColorfulPass; key: string }> = [
    { value: "none", key: "page.predictionPlanner.rules.controls.passNone" },
    { value: "normal", key: "page.predictionPlanner.rules.controls.passNormal" },
    { value: "precious", key: "page.predictionPlanner.rules.controls.passPrecious" },
];

const WARNING_KEYS: Record<string, string> = {
    unregisteredSpecialMeasure: "page.predictionPlanner.rules.warnings.unregisteredSpecialMeasure",
    unknownWlTurn: "page.predictionPlanner.rules.warnings.unknownWlTurn",
    engineGap: "page.predictionPlanner.rules.warnings.engineGap",
};

const NOTE_KEYS: Record<string, string> = {
    finaleWl2: "page.predictionPlanner.rules.notes.finaleWl2",
    finaleWl3: "page.predictionPlanner.rules.notes.finaleWl3",
    wl3Chapter: "page.predictionPlanner.rules.notes.wl3Chapter",
    cnWl1: "page.predictionPlanner.rules.notes.cnWl1",
};

/** Accepts both a bare id and the full i18n key, since EventRules documents the full-key form. */
function lookupKey(map: Record<string, string>, raw: string): string {
    const bare = raw.slice(raw.lastIndexOf(".") + 1);
    return map[bare] ?? raw;
}

/** Chapter the "this chapter" scope should point at: the running one, else the latest started, else the first. */
function pickChapterCharacter(rules: EventRules, chapters: WorldBloomChapterRow[], now: number): number | null {
    const rows = chapters.length > 0
        ? chapters.map((c) => ({ id: c.gameCharacterId, start: c.chapterStartAt, end: c.aggregateAt }))
        : rules.chapters
            .filter((c) => c.gameCharacterId !== null)
            .map((c) => ({ id: c.gameCharacterId as number, start: c.startAt, end: c.aggregateAt }));
    if (rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => a.start - b.start);
    const running = sorted.find((c) => now >= c.start && now < c.end);
    if (running) return running.id;
    const started = sorted.filter((c) => c.start <= now);
    return (started.length > 0 ? started[started.length - 1] : sorted[0]).id;
}

function SegmentButton({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
    return (
        <Chip selected={active} showCheckmark={false} onClick={onClick}>
            {children}
        </Chip>
    );
}

function ResetButton({ onClick }: { onClick(): void }) {
    const { t } = useI18n();
    return (
        <Button variant="text" size="xs" icon={mdRefresh} onClick={onClick}>
            {t("page.predictionPlanner.rules.controls.reset")}
        </Button>
    );
}

function SourceBadge({ source, sourceRef }: { source: RuleSource; sourceRef?: string }) {
    const { t } = useI18n();
    return (
        <span className="inline-flex flex-wrap items-center gap-1 min-w-0">
            <span className={`inline-block px-2 py-1 rounded-md3-sm border type-label-s whitespace-nowrap ${SOURCE_STYLES[source]}`}>
                {t(SOURCE_KEYS[source])}
            </span>
            {sourceRef && (
                <span className="type-label-s font-mono text-on-surface-variant break-all">{sourceRef}</span>
            )}
        </span>
    );
}

interface RuleRowProps {
    label: string;
    source?: { source: RuleSource; ref?: string };
    control?: React.ReactNode;
    children: React.ReactNode;
}

function RuleRow({ label, source, control, children }: RuleRowProps) {
    return (
        <div className="py-2.5 flex flex-col gap-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <dt className="type-label-l text-on-surface-variant">{label}</dt>
                {source && <SourceBadge source={source.source} sourceRef={source.ref} />}
            </div>
            <dd className="type-body-m text-on-surface break-words min-w-0">{children}</dd>
            {control && <div className="flex flex-wrap items-center gap-2">{control}</div>}
        </div>
    );
}

function sourceOf<T>(v: RuleValue<T>): { source: RuleSource; ref?: string } {
    return { source: v.source, ref: v.ref };
}

export default function RulesCard({ rules, overrides, onOverridesChange, scope, onScopeChange, chapters }: RulesCardProps) {
    const { t, formatNumber } = useI18n();
    const [expanded, setExpanded] = useState(false);

    const none = t("page.predictionPlanner.rules.values.none");
    const onText = t("page.predictionPlanner.rules.controls.on");
    const offText = t("page.predictionPlanner.rules.controls.off");
    const percent = (value: number) => t("page.predictionPlanner.rules.values.percent", { value: formatNumber(value) });

    const specialMeasure = rules.auto.value.specialMeasure;
    const gaugeOn = rules.breakGauge.value !== null;

    const patchOverrides = (patch: Partial<RuleOverrides>) => {
        onOverridesChange({ ...overrides, ...patch });
    };
    const clearOverride = (key: keyof RuleOverrides) => {
        const next = { ...overrides };
        delete next[key];
        onOverridesChange(next);
    };

    const showScope = !rules.isFinale && rules.chapters.some((c) => c.gameCharacterId !== null);
    const selectChapterScope = () => {
        if (scope.kind === "chapter") return;
        const id = pickChapterCharacter(rules, chapters, Date.now());
        if (id !== null) onScopeChange({ kind: "chapter", gameCharacterId: id });
    };

    const warnings = rules.warnings.map((raw) => {
        const key = lookupKey(WARNING_KEYS, raw);
        return key === WARNING_KEYS.engineGap
            ? t(key, { tables: rules.engineCoverageGaps.join(", ") })
            : t(key);
    });

    const chapterLines = rules.chapters.map((c) =>
        t("page.predictionPlanner.rules.values.chapter", {
            no: c.chapterNo,
            character: c.gameCharacterId !== null ? getCharacterName(t, c.gameCharacterId) : "",
            hours: c.hours,
        }).replace(/\s{2,}/g, " ").trim(),
    );

    const memberLimit = rules.memberBonusLimit.value;
    const skillCap = rules.skillCap.value;
    const fixtureCap = rules.fixtureBonusCap.value;
    const powerCap = rules.powerCap.value;
    const shuffle = rules.shuffleUnitBonus.value;
    const support = rules.supportDeck.value;
    const gauge = rules.breakGauge.value;
    const eventCard = rules.eventCardBonus.value;
    const honor = rules.honorBonus.value;
    const unitLimited = rules.unitLimitedSupportBonus.value;
    const lastTier = rules.rankingTiers[rules.rankingTiers.length - 1];
    // A resolved chapter scope reads the chapter ranking table (event-rules index.ts).
    const tiersRef = rules.scope.kind === "chapter" ? "worldBloomChapterRankingRewardRanges" : "eventRankingRewardRanges";

    const passChanged = overrides.pass !== undefined && overrides.pass !== "none";

    return (
        <Surface as="section" tone="card" radius="lg" className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
                <h2 className="min-w-0 type-title-l text-on-surface">
                    {t("page.predictionPlanner.rules.title")}
                </h2>
                <Button
                    variant="tonal"
                    color="secondary"
                    size="xs"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    trailingIcon={expanded ? mdKeyboardArrowUp : mdKeyboardArrowDown}
                    className="shrink-0"
                >
                    {expanded ? t("page.predictionPlanner.rules.collapse") : t("page.predictionPlanner.rules.expand")}
                </Button>
            </div>

            {warnings.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                    {warnings.map((text, i) => (
                        <li key={i}>
                            <Banner tone="warning" className="break-words">{text}</Banner>
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2.5">
                {showScope && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="type-label-l text-on-surface-variant mr-0.5">
                            {t("page.predictionPlanner.rules.controls.scope")}
                        </span>
                        <SegmentedButton
                            value={scope.kind}
                            onValueChange={(kind) => kind === "chapter" ? selectChapterScope() : onScopeChange({ kind: "overall" })}
                            options={[
                                { value: "chapter", label: t("page.predictionPlanner.rules.controls.scopeChapter") },
                                { value: "overall", label: t("page.predictionPlanner.rules.controls.scopeOverall") },
                            ]}
                            aria-label={t("page.predictionPlanner.rules.controls.scope")}
                            showCheckmark={false}
                            density={-2}
                            className="w-auto"
                        />
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="type-label-l text-on-surface-variant mr-0.5">
                        {t("page.predictionPlanner.rules.controls.pass")}
                    </span>
                    <SegmentedButton
                        value={rules.pass}
                        onValueChange={(pass) => patchOverrides({ pass })}
                        options={PASS_OPTIONS.map((option) => ({ value: option.value, label: t(option.key) }))}
                        aria-label={t("page.predictionPlanner.rules.controls.pass")}
                        showCheckmark={false}
                        density={-2}
                        className="w-auto"
                    />
                    {passChanged && <ResetButton onClick={() => clearOverride("pass")} />}
                </div>
            </div>

            {expanded && (
                <dl className="mt-3 pt-1 border-t border-outline-variant divide-y divide-outline-variant">
                    <RuleRow
                        label={t("page.predictionPlanner.rules.items.chapters")}
                        source={rules.chapters.length > 0 ? { source: "masterdata", ref: "worldBlooms" } : undefined}
                    >
                        {chapterLines.length > 0 ? (
                            <ul className="space-y-0.5">
                                {chapterLines.map((line, i) => <li key={i}>{line}</li>)}
                            </ul>
                        ) : none}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.memberBonusLimit")} source={sourceOf(rules.memberBonusLimit)}>
                        {memberLimit === null ? none : t("page.predictionPlanner.rules.values.limitCards", { count: memberLimit })}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.skillCap")} source={sourceOf(rules.skillCap)}>
                        {skillCap === null ? none : percent(skillCap)}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.fixtureBonusCap")} source={sourceOf(rules.fixtureBonusCap)}>
                        {fixtureCap === null ? none : percent(fixtureCap)}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.powerCap")} source={sourceOf(rules.powerCap)}>
                        {powerCap === null ? none : formatNumber(powerCap)}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.shuffleUnitBonus")} source={sourceOf(rules.shuffleUnitBonus)}>
                        {shuffle.length === 0
                            ? none
                            : shuffle
                                .map((row) => t("page.predictionPlanner.rules.values.shuffle", { count: row.unitCount, rate: formatNumber(row.bonusRate) }))
                                .join(" / ")}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.supportDeck")} source={sourceOf(rules.supportDeck)}>
                        {support === null ? none : t("page.predictionPlanner.rules.values.supportSlots", { slots: support.slots, table: support.table ?? "?" })}
                    </RuleRow>
                    <RuleRow
                        label={t("page.predictionPlanner.rules.items.breakGauge")}
                        source={rules.breakGaugeConfigured ? sourceOf(rules.breakGauge) : undefined}
                        control={rules.breakGaugeConfigured ? (
                            <>
                                <span className="type-label-m text-on-surface-variant">{t("page.predictionPlanner.rules.controls.gauge")}</span>
                                <SegmentButton active={gaugeOn} onClick={() => patchOverrides({ breakGaugeEnabled: true })}>{onText}</SegmentButton>
                                <SegmentButton active={!gaugeOn} onClick={() => patchOverrides({ breakGaugeEnabled: false })}>{offText}</SegmentButton>
                                {overrides.breakGaugeEnabled !== undefined && <ResetButton onClick={() => clearOverride("breakGaugeEnabled")} />}
                            </>
                        ) : undefined}
                    >
                        {gauge === null
                            ? (rules.breakGaugeConfigured ? offText : none)
                            : t("page.predictionPlanner.rules.values.gauge", {
                                gain: formatNumber(gauge.gainPerSecond),
                                max: formatNumber(gauge.max),
                                step: formatNumber(gauge.restStepMinutes),
                                decrease: formatNumber(gauge.restStepDecrease),
                            })}
                    </RuleRow>
                    <RuleRow
                        label={t("page.predictionPlanner.rules.items.autoMeasure")}
                        source={sourceOf(rules.auto)}
                        control={(
                            <>
                                <span className="type-label-m text-on-surface-variant">{t("page.predictionPlanner.rules.controls.autoMeasure")}</span>
                                <SegmentButton active={specialMeasure} onClick={() => patchOverrides({ autoSpecialMeasure: true })}>{onText}</SegmentButton>
                                <SegmentButton active={!specialMeasure} onClick={() => patchOverrides({ autoSpecialMeasure: false })}>{offText}</SegmentButton>
                                {overrides.autoSpecialMeasure !== undefined && <ResetButton onClick={() => clearOverride("autoSpecialMeasure")} />}
                            </>
                        )}
                    >
                        {specialMeasure ? onText : offText}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.autoDailyLimit")} source={sourceOf(rules.auto)}>
                        {t("page.predictionPlanner.rules.values.autoLimit", { count: rules.autoDailyLimit })}
                    </RuleRow>
                    <RuleRow
                        label={t("page.predictionPlanner.rules.items.rankingTiers")}
                        source={rules.rankingTiers.length > 0 ? { source: "masterdata", ref: tiersRef } : undefined}
                    >
                        {lastTier === undefined
                            ? none
                            : t("page.predictionPlanner.rules.values.tiers", { count: rules.rankingTiers.length, last: formatNumber(lastTier) })}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.eventCardBonus")} source={sourceOf(rules.eventCardBonus)}>
                        {eventCard === null
                            ? none
                            : eventCard.leaderBonusRate === 0
                                ? percent(eventCard.bonusRate)
                                : t("page.predictionPlanner.rules.values.eventCard", { rate: formatNumber(eventCard.bonusRate), leader: formatNumber(eventCard.leaderBonusRate) })}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.honorBonus")} source={sourceOf(rules.honorBonus)}>
                        {honor === null
                            ? none
                            : t("page.predictionPlanner.rules.values.honor", { count: honor.titles, rate: formatNumber(honor.bonusRate) })}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.unitLimitedSupportBonus")} source={sourceOf(rules.unitLimitedSupportBonus)}>
                        {unitLimited === null ? none : percent(unitLimited)}
                    </RuleRow>
                    <RuleRow label={t("page.predictionPlanner.rules.items.editionNotes")}>
                        {rules.editionNotes.length === 0 ? none : (
                            <ul className="space-y-1.5 type-body-m text-on-surface">
                                {rules.editionNotes.map((raw) => (
                                    <li key={raw}>{t(lookupKey(NOTE_KEYS, raw))}</li>
                                ))}
                            </ul>
                        )}
                    </RuleRow>
                </dl>
            )}
        </Surface>
    );
}
