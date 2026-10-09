"use client";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { getAssetSourceFallbackOrder, getMusicScoreUrl } from "@/lib/assets";
import { analyzeSusChart, type ChartAnalysis, type ChartNoteKind, type ChartWindowStats } from "@/lib/sekaiChart";
import { DIFFICULTY_COLORS, DIFFICULTY_NAMES, type MusicDifficultyType } from "@/types/music";
import { CircularProgress, Icon } from "@/components/md3";
import { mdAnalytics } from "@/components/md3/icons";

const NOTE_KIND_ORDER: ChartNoteKind[] = ["tap", "flick", "trace", "holdStart", "holdEnd", "holdRelay", "holdTick"];

const PLOT_HEIGHT = 100;

const analysisCache = new Map<string, Promise<ChartAnalysis>>();

function loadAnalysis(musicId: number, difficulty: string, sources: string[]): Promise<ChartAnalysis> {
    const key = `${sources[0]}:${musicId}:${difficulty}`;
    let pending = analysisCache.get(key);
    if (!pending) {
        pending = (async () => {
            for (const source of sources) {
                try {
                    const res = await fetch(getMusicScoreUrl(musicId, difficulty, source as Parameters<typeof getMusicScoreUrl>[2]));
                    if (res.ok) return analyzeSusChart(await res.text());
                } catch {
                    // try the next asset source
                }
            }
            throw new Error(`SUS ${musicId}/${difficulty}: not found`);
        })();
        pending.catch(() => analysisCache.delete(key));
        analysisCache.set(key, pending);
    }
    return pending;
}

function formatTime(seconds: number, precise = false): string {
    const clamped = Math.max(0, seconds);
    const minutes = Math.floor(clamped / 60);
    const rest = clamped - minutes * 60;
    const secondsText = precise ? rest.toFixed(1).padStart(4, "0") : Math.floor(rest).toString().padStart(2, "0");
    return `${minutes}:${secondsText}`;
}

type LoadState =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; analysis: ChartAnalysis };

type LoadResult = Exclude<LoadState, { status: "loading" }> & { key: string };

interface ChartAnalysisCardProps {
    musicId: number;
    difficulty: MusicDifficultyType;
    playLevel?: number;
    officialNoteCount?: number;
}

export default function ChartAnalysisCard({ musicId, difficulty, playLevel, officialNoteCount }: ChartAnalysisCardProps) {
    const { assetSource } = useTheme();
    const { t, formatNumber } = useI18n();
    const requestKey = `${assetSource}:${musicId}:${difficulty}`;
    const [result, setResult] = useState<LoadResult | null>(null);
    const state: LoadState = result?.key === requestKey ? result : { status: "loading" };

    useEffect(() => {
        let active = true;
        loadAnalysis(musicId, difficulty, getAssetSourceFallbackOrder(assetSource))
            .then((analysis) => {
                if (active) setResult({ key: requestKey, status: "ready", analysis });
            })
            .catch(() => {
                if (active) setResult({ key: requestKey, status: "error" });
            });
        return () => {
            active = false;
        };
    }, [musicId, difficulty, assetSource, requestKey]);

    const color = DIFFICULTY_COLORS[difficulty];

    return (
        <div className="rounded-md3-xl bg-surface-container-low overflow-hidden">
            <div className="flex min-h-14 items-center gap-3 px-5 pt-4 pb-2">
                <Icon path={mdAnalytics} size={24} className="text-primary" />
                <h2 className="min-w-0 flex-1 truncate type-title-l text-on-surface">{t("page.music.chartAnalysis.title")}</h2>
                <span className="shrink-0 rounded-md3-sm px-2 py-0.5 type-label-m font-bold text-white" style={{ backgroundColor: color }}>
                    {DIFFICULTY_NAMES[difficulty]}{playLevel != null ? ` ${playLevel}` : ""}
                </span>
            </div>

            {state.status === "loading" && (
                <div className="flex items-center justify-center gap-3 px-5 py-10 type-body-m text-on-surface-variant">
                    <CircularProgress size={24} aria-label={t("page.music.chartAnalysis.loading")} />
                    {t("page.music.chartAnalysis.loading")}
                </div>
            )}
            {state.status === "error" && (
                <div className="px-5 py-10 text-center type-body-m text-on-surface-variant">{t("page.music.chartAnalysis.failed")}</div>
            )}
            {state.status === "ready" && (
                <ChartAnalysisBody analysis={state.analysis} difficulty={difficulty} officialNoteCount={officialNoteCount} t={t} formatNumber={formatNumber} />
            )}
        </div>
    );
}

interface BodyProps {
    analysis: ChartAnalysis;
    difficulty: MusicDifficultyType;
    officialNoteCount?: number;
    t: ReturnType<typeof useI18n>["t"];
    formatNumber: ReturnType<typeof useI18n>["formatNumber"];
}

function ChartAnalysisBody({ analysis, difficulty, officialNoteCount, t, formatNumber }: BodyProps) {
    const span = Math.max(analysis.lastNoteTime - analysis.firstNoteTime, 0);
    const averageDensity = span > 0 ? analysis.combo / span : 0;
    const bestSkill = analysis.skills.reduce<number>(
        (best, skill, i) => (best === -1 || skill.weight > analysis.skills[best].weight ? i : best),
        -1,
    );
    const percent = (share: number) => formatNumber(share, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const perSecond = (value: number) => t("page.music.chartAnalysis.perSecond", { value: formatNumber(value, { maximumFractionDigits: 1 }) });

    const stats = [
        { label: t("page.music.chartAnalysis.stats.length"), value: formatTime(span) },
        { label: t("page.music.chartAnalysis.stats.averageDensity"), value: perSecond(averageDensity) },
        { label: t("page.music.chartAnalysis.stats.peakDensity"), value: perSecond(analysis.peakNotesPerSecond) },
        { label: t("page.music.chartAnalysis.stats.critical"), value: formatNumber(analysis.criticalCount) },
    ];

    return (
        <div className="space-y-5 px-5 pb-5">
            {officialNoteCount != null && officialNoteCount !== analysis.combo && (
                <p className="rounded-md3-md bg-tertiary-container px-3 py-2 type-body-s text-on-tertiary-container">
                    {t("page.music.chartAnalysis.comboMismatch", { parsed: formatNumber(analysis.combo), official: formatNumber(officialNoteCount) })}
                </p>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {stats.map((stat) => (
                    <div key={stat.label} className="rounded-md3-md bg-surface-container px-3 py-2">
                        <div className="type-label-s text-on-surface-variant">{stat.label}</div>
                        <div className="type-title-m text-on-surface tabular-nums">{stat.value}</div>
                    </div>
                ))}
            </div>

            <ChartTimeline analysis={analysis} difficulty={difficulty} t={t} formatNumber={formatNumber} />

            <div className="flex flex-wrap gap-1.5">
                {NOTE_KIND_ORDER.filter((kind) => analysis.kindCounts[kind] > 0).map((kind) => (
                    <span key={kind} className="inline-flex items-center gap-1.5 rounded-md3-sm bg-surface-container-high px-2.5 py-1 type-label-m text-on-surface-variant">
                        {t(`page.music.chartAnalysis.noteKinds.${kind}`)}
                        <span className="text-on-surface tabular-nums">{formatNumber(analysis.kindCounts[kind])}</span>
                    </span>
                ))}
            </div>

            {analysis.skills.length > 0 && (
                <WindowTable
                    title={t("page.music.chartAnalysis.skillsTitle")}
                    swatchClassName="bg-primary"
                    rows={analysis.skills.map((skill, i) => ({
                        key: `skill-${i}`,
                        label: t("page.music.chartAnalysis.skillLabel", { index: i + 1 }),
                        stats: skill,
                        badge: i === bestSkill && analysis.skills.length > 1 ? t("page.music.chartAnalysis.bestSkill") : undefined,
                    }))}
                    t={t}
                    formatNumber={formatNumber}
                    percent={percent}
                />
            )}

            {analysis.feverChance || analysis.superFever ? (
                <WindowTable
                    title={t("page.music.chartAnalysis.feverTitle")}
                    swatchClassName="bg-tertiary"
                    rows={[
                        ...(analysis.feverChance ? [{ key: "fever-chance", label: t("page.music.chartAnalysis.feverChance"), stats: analysis.feverChance }] : []),
                        ...(analysis.superFever ? [{ key: "super-fever", label: t("page.music.chartAnalysis.superFever"), stats: analysis.superFever }] : []),
                    ]}
                    t={t}
                    formatNumber={formatNumber}
                    percent={percent}
                />
            ) : (
                <p className="type-body-s text-on-surface-variant">{t("page.music.chartAnalysis.noFever")}</p>
            )}

            <p className="type-label-s text-on-surface-variant">{t("page.music.chartAnalysis.footnote")}</p>
        </div>
    );
}

interface WindowRow {
    key: string;
    label: string;
    stats: ChartWindowStats;
    badge?: string;
}

function WindowTable({
    title,
    swatchClassName,
    rows,
    t,
    formatNumber,
    percent,
}: {
    title: string;
    swatchClassName: string;
    rows: WindowRow[];
    t: BodyProps["t"];
    formatNumber: BodyProps["formatNumber"];
    percent: (share: number) => string;
}) {
    return (
        <div>
            <h3 className="mb-1 flex items-center gap-2 type-title-s text-on-surface">
                <span className={`h-3 w-3 rounded-full ${swatchClassName}`} aria-hidden />
                {title}
            </h3>
            <table className="w-full type-body-m">
                <thead>
                    <tr className="type-label-m text-on-surface-variant">
                        <th className="py-1.5 text-left font-normal">{t("page.music.chartAnalysis.columns.segment")}</th>
                        <th className="py-1.5 text-left font-normal">{t("page.music.chartAnalysis.columns.time")}</th>
                        <th className="py-1.5 text-right font-normal">{t("page.music.chartAnalysis.columns.notes")}</th>
                        <th className="py-1.5 text-right font-normal">{t("page.music.chartAnalysis.columns.share")}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant border-t border-outline-variant">
                    {rows.map((row) => (
                        <tr key={row.key}>
                            <td className="py-2 text-on-surface">
                                <span className="inline-flex flex-wrap items-center gap-1.5">
                                    {row.label}
                                    {row.badge && (
                                        <span className="rounded-md3-xs bg-primary-container px-1.5 py-0.5 type-label-s text-on-primary-container">{row.badge}</span>
                                    )}
                                </span>
                            </td>
                            <td className="py-2 text-on-surface-variant tabular-nums">
                                {formatTime(row.stats.start, true)}–{formatTime(row.stats.end, true)}
                            </td>
                            <td className="py-2 text-right text-on-surface tabular-nums">{formatNumber(row.stats.noteCount)}</td>
                            <td className="py-2 text-right text-on-surface tabular-nums">{percent(row.stats.weightShare)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ChartTimeline({
    analysis,
    difficulty,
    t,
    formatNumber,
}: {
    analysis: ChartAnalysis;
    difficulty: MusicDifficultyType;
    t: BodyProps["t"];
    formatNumber: BodyProps["formatNumber"];
}) {
    const [hoverSecond, setHoverSecond] = useState<number | null>(null);

    const { bins, duration, maxBin } = useMemo(() => {
        const end = Math.max(analysis.lastNoteTime, analysis.superFever?.end ?? 0) + 1;
        const binCount = Math.max(1, Math.ceil(end));
        const counts = new Array<number>(binCount).fill(0);
        for (const note of analysis.notes) {
            counts[Math.min(binCount - 1, Math.max(0, Math.floor(note.time)))] += 1;
        }
        return { bins: counts, duration: binCount, maxBin: Math.max(1, ...counts) };
    }, [analysis]);

    const areaPath = useMemo(() => {
        const y = (count: number) => PLOT_HEIGHT - (count / maxBin) * (PLOT_HEIGHT - 4);
        let path = `M0 ${PLOT_HEIGHT}`;
        bins.forEach((count, i) => {
            path += ` L${i} ${y(count)} L${i + 1} ${y(count)}`;
        });
        return `${path} L${duration} ${PLOT_HEIGHT} Z`;
    }, [bins, duration, maxBin]);

    const xPercent = (seconds: number) => `${(Math.min(Math.max(seconds, 0), duration) / duration) * 100}%`;
    const tickStep = duration > 240 ? 60 : duration > 100 ? 30 : duration > 50 ? 15 : 10;
    const ticks: number[] = [];
    for (let s = 0; s < duration - tickStep / 3; s += tickStep) ticks.push(s);

    const hoverLabel = (() => {
        if (hoverSecond === null) return null;
        const inside = (w: ChartWindowStats | null) => w !== null && hoverSecond >= w.start && hoverSecond < w.end;
        const skillIndex = analysis.skills.findIndex((skill) => hoverSecond >= skill.start && hoverSecond < skill.end);
        const segment = skillIndex !== -1
            ? t("page.music.chartAnalysis.skillLabel", { index: skillIndex + 1 })
            : inside(analysis.superFever)
                ? t("page.music.chartAnalysis.superFever")
                : inside(analysis.feverChance)
                    ? t("page.music.chartAnalysis.feverChance")
                    : null;
        const count = bins[Math.min(bins.length - 1, Math.floor(hoverSecond))] ?? 0;
        const base = t("page.music.chartAnalysis.tooltip", { time: formatTime(hoverSecond), count: formatNumber(count) });
        return segment ? `${base} · ${segment}` : base;
    })();

    const legend = [
        { key: "density", className: "bg-on-surface-variant/30", label: t("page.music.chartAnalysis.legendDensity") },
        { key: "skill", className: "bg-primary/40", label: t("page.music.chartAnalysis.skillsTitle") },
        { key: "fever-chance", className: "bg-tertiary/20", label: t("page.music.chartAnalysis.feverChance") },
        { key: "super-fever", className: "bg-tertiary/45", label: t("page.music.chartAnalysis.superFever") },
    ];

    return (
        <div>
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 type-label-m text-on-surface-variant">
                {legend.map((item) => (
                    <span key={item.key} className="inline-flex items-center gap-1.5">
                        <span className={`h-2.5 w-4 rounded-sm ${item.className}`} aria-hidden />
                        {item.label}
                    </span>
                ))}
            </div>
            <div
                className="relative h-32 touch-none select-none overflow-hidden rounded-md3-md bg-surface-container"
                role="img"
                aria-label={t("page.music.chartAnalysis.timelineAria", { difficulty: DIFFICULTY_NAMES[difficulty] })}
                onPointerMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoverSecond(((e.clientX - rect.left) / rect.width) * duration);
                }}
                onPointerLeave={() => setHoverSecond(null)}
            >
                <svg viewBox={`0 0 ${duration} ${PLOT_HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                    {analysis.feverChance && (
                        <rect x={analysis.feverChance.start} y={0} width={analysis.feverChance.end - analysis.feverChance.start} height={PLOT_HEIGHT} className="fill-tertiary/20" />
                    )}
                    {analysis.superFever && (
                        <rect x={analysis.superFever.start} y={0} width={analysis.superFever.end - analysis.superFever.start} height={PLOT_HEIGHT} className="fill-tertiary/45" />
                    )}
                    {analysis.skills.map((skill, i) => (
                        <rect key={i} x={skill.start} y={0} width={skill.end - skill.start} height={PLOT_HEIGHT} className="fill-primary/40" />
                    ))}
                    <path d={areaPath} className="fill-on-surface-variant/20 stroke-on-surface-variant" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
                    {hoverSecond !== null && (
                        <line x1={hoverSecond} x2={hoverSecond} y1={0} y2={PLOT_HEIGHT} className="stroke-on-surface" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    )}
                </svg>
                {analysis.skills.map((skill, i) => (
                    <span
                        key={i}
                        className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-full bg-primary px-1.5 type-label-s leading-4 text-on-primary"
                        style={{ left: xPercent((skill.start + skill.end) / 2) }}
                    >
                        {i + 1}
                    </span>
                ))}
                {hoverLabel && hoverSecond !== null && (
                    <span
                        className="pointer-events-none absolute bottom-1 whitespace-nowrap rounded-md3-xs bg-inverse-surface px-2 py-0.5 type-label-s text-inverse-on-surface"
                        style={hoverSecond / duration > 0.5 ? { right: `calc(100% - ${xPercent(hoverSecond)} + 6px)` } : { left: `calc(${xPercent(hoverSecond)} + 6px)` }}
                    >
                        {hoverLabel}
                    </span>
                )}
            </div>
            <div className="relative mt-1 h-4 type-label-s text-on-surface-variant tabular-nums">
                {ticks.map((s) => (
                    <span key={s} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: xPercent(s) }}>
                        {formatTime(s)}
                    </span>
                ))}
            </div>
        </div>
    );
}
