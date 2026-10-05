"use client";
import React from "react";
import { Button, Card, Icon } from "@/components/md3";
import { mdChevronRight, mdLeaderboard } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { ServerType } from "@/types/prediction";

interface PlannerEntryCardProps {
    server: ServerType;
    eventId: number;
    /** "overall" or the WL chapter's gameCharacterId. */
    chapter: "overall" | number;
}

export function buildPlannerHref(server: ServerType, eventId: number, chapter: "overall" | number): string {
    const params = new URLSearchParams({ server, event: String(eventId), chapter: String(chapter) });
    return `/prediction-next/planner/?${params.toString()}`;
}

/** Link card from the prediction page to the ranking-goal planner, carrying server, event and chapter. */
export function PlannerEntryCard({ server, eventId, chapter }: PlannerEntryCardProps) {
    const { t } = useI18n();

    return (
        <Card variant="outlined" radius="lg" className="p-4 sm:p-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 shrink-0 rounded-md3-md bg-secondary-container text-on-secondary-container flex items-center justify-center">
                    <Icon path={mdLeaderboard} size={24} />
                </div>
                <div className="min-w-0">
                    <h3 className="type-title-m text-on-surface">
                        {t("page.predictionPlanner.entryCard.title")}
                    </h3>
                    <p className="mt-1 type-body-m text-on-surface-variant">
                        {t("page.predictionPlanner.entryCard.description")}
                    </p>
                </div>
            </div>
            <Button
                href={buildPlannerHref(server, eventId, chapter)}
                trailingIcon={mdChevronRight}
                className="shrink-0"
            >
                {t("page.predictionPlanner.entryCard.action")}
            </Button>
        </Card>
    );
}

export default PlannerEntryCard;
