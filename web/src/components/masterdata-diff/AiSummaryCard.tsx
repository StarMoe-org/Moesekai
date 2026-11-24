"use client";

import { useI18n } from "@/contexts/I18nContext";
import { Button, Card, CircularProgress, Icon, Surface } from "@/components/md3";
import { mdBolt, mdCheckCircle, mdInfo, mdRefresh, mdWarning } from "@/components/md3/icons";
import type { MasterdataSummaryResponse } from "@/types/masterdataDiff";

interface AiSummaryCardProps {
    summary: MasterdataSummaryResponse | null;
    isLoading: boolean;
    error: string | null;
    onRetry: () => void;
}

export default function AiSummaryCard({
    summary,
    isLoading,
    error,
    onRetry,
}: AiSummaryCardProps) {
    const { t } = useI18n();

    return (
        <Card variant="outlined" className="overflow-hidden border-outline-variant bg-surface-container-low">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md3-full bg-primary-container text-on-primary-container">
                        <Icon path={mdBolt} size={18} />
                    </span>
                    <div>
                        <h2 className="type-title-m text-on-surface">
                            {t("page.masterdataDiff.summary.title")}
                        </h2>
                        <p className="type-body-s text-on-surface-variant">
                            {t("page.masterdataDiff.summary.subtitle")}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {summary && (
                        <>
                            <span
                                className={
                                    summary.source === "ai"
                                        ? "inline-flex items-center gap-1 rounded-md3-full bg-primary-container px-2.5 py-0.5 type-label-s text-on-primary-container"
                                        : "inline-flex items-center gap-1 rounded-md3-full bg-secondary-container px-2.5 py-0.5 type-label-s text-on-secondary-container"
                                }
                            >
                                <Icon path={summary.source === "ai" ? mdCheckCircle : mdInfo} size={14} />
                                {summary.source === "ai"
                                    ? t("page.masterdataDiff.summary.badgeAi")
                                    : t("page.masterdataDiff.summary.badgeFallback")}
                            </span>
                            {summary.model && (
                                <span className="rounded-md3-full bg-surface-container-highest px-2.5 py-0.5 type-label-s text-on-surface-variant">
                                    {summary.model}
                                </span>
                            )}
                            {summary.cached && (
                                <span className="rounded-md3-full bg-surface-container-high px-2.5 py-0.5 type-label-s text-on-surface-variant">
                                    {t("page.masterdataDiff.summary.cached")}
                                </span>
                            )}
                        </>
                    )}
                    {!isLoading && (
                        <Button variant="text" size="xs" icon={mdRefresh} onClick={onRetry}>
                            {t("common.action.retry")}
                        </Button>
                    )}
                </div>
            </div>

            <div className="p-5">
                {isLoading && (
                    <div className="flex items-center gap-3 py-4 text-on-surface-variant">
                        <CircularProgress size={22} />
                        <span className="type-body-m">{t("page.masterdataDiff.summary.loading")}</span>
                    </div>
                )}

                {!isLoading && error && (
                    <Surface
                        tone="high"
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md3-m border border-outline-variant p-4"
                    >
                        <div className="flex items-center gap-2.5 text-error">
                            <Icon path={mdWarning} size={20} />
                            <span className="type-body-m">
                                {t("page.masterdataDiff.summary.error", { message: error })}
                            </span>
                        </div>
                        <Button variant="tonal" size="xs" icon={mdRefresh} onClick={onRetry}>
                            {t("common.action.retry")}
                        </Button>
                    </Surface>
                )}

                {!isLoading && !error && summary && (
                    <div className="space-y-4">
                        <p className="type-title-m text-on-surface leading-relaxed">
                            {summary.headline}
                        </p>

                        {summary.highlights && summary.highlights.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {summary.highlights.map((hl, idx) => (
                                    <span
                                        key={idx}
                                        className="rounded-md3-s bg-surface-container-high px-3 py-1.5 type-body-s text-on-surface"
                                    >
                                        {hl}
                                    </span>
                                ))}
                            </div>
                        )}

                        {summary.sections && summary.sections.length > 0 && (
                            <div className="grid gap-3 md:grid-cols-2">
                                {summary.sections.map((section, idx) => (
                                    <Surface
                                        key={`${section.category}-${idx}`}
                                        tone="default"
                                        className="rounded-md3-m border border-outline-variant/70 p-3.5"
                                    >
                                        <h3 className="type-label-l text-primary mb-2">
                                            {section.title}
                                        </h3>
                                        <ul className="space-y-1.5 type-body-s text-on-surface-variant list-disc pl-4">
                                            {section.items.map((line, i) => (
                                                <li key={i} className="leading-relaxed">
                                                    {line}
                                                </li>
                                            ))}
                                        </ul>
                                    </Surface>
                                ))}
                            </div>
                        )}

                        {summary.notes && (
                            <div className="flex items-start gap-2 rounded-md3-s bg-surface-container-high px-3.5 py-2.5 type-body-s text-on-surface-variant">
                                <Icon path={mdInfo} size={16} className="mt-0.5 shrink-0" />
                                <span>{summary.notes}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
}
