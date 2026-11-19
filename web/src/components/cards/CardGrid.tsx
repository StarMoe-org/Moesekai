"use client";
import React from "react";
import { ICardInfo, ISkillInfo } from "@/types/types";
import CardItem from "./CardItem";
import CardTable from "./CardTable";
import { useI18n } from "@/contexts/I18nContext";
import { EmptyState } from "@/components/md3";
import { mdStyle } from "@/components/md3/icons";
import type { CardViewMode } from "./ViewToggle";
import { useGridReflowAnimation } from "@/hooks/useGridReflowAnimation";

interface CardGridProps {
    cards: ICardInfo[];
    isLoading?: boolean;
    hrefPrefix?: string;
    view?: CardViewMode;
    skillsMap?: Map<number, ISkillInfo>;
}

// Loading skeleton component
function CardSkeleton({ large = false }: { large?: boolean }) {
    return (
        <div className={`${large ? "rounded-t-none rounded-b-md3-md" : "rounded-md3-md"} overflow-hidden bg-surface-container-low animate-pulse`}>
            <div className={`${large ? "aspect-[940/530]" : "aspect-[4/5]"} bg-surface-container-high`} />
            <div className="p-3 space-y-2">
                <div className="h-4 bg-surface-container-highest rounded-md3-xs w-3/4" />
                <div className="h-3 bg-surface-container-high rounded-md3-xs w-1/2" />
            </div>
        </div>
    );
}

export default function CardGrid({ cards, isLoading = false, hrefPrefix, view = "grid", skillsMap }: CardGridProps) {
    const [now] = React.useState(() => Date.now());
    const { t } = useI18n();
    const gridRef = useGridReflowAnimation<HTMLDivElement>();

    if (isLoading) {
        if (view === "large") {
            return (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <CardSkeleton key={i} large />
                    ))}
                </div>
            );
        }
        return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </div>
        );
    }

    if (cards.length === 0) {
        return <EmptyState icon={mdStyle} title={t("page.cards.noResult")} description={t("page.cards.noResultHint")} />;
    }

    if (view === "table") {
        return <CardTable cards={cards} hrefPrefix={hrefPrefix} skillsMap={skillsMap} />;
    }

    if (view === "large") {
        return (
            <div ref={gridRef} className="relative grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                {cards.map((card) => {
                    const isSpoiler = (card.releaseAt || card.archivePublishedAt || 0) > now;
                    return <CardItem key={card.id} card={card} isSpoiler={isSpoiler} hrefPrefix={hrefPrefix} variant="large" skillsMap={skillsMap} />;
                })}
            </div>
        );
    }

    return (
        <div ref={gridRef} className="relative grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
            {cards.map((card) => {
                const isSpoiler = (card.releaseAt || card.archivePublishedAt || 0) > now;
                return <CardItem key={card.id} card={card} isSpoiler={isSpoiler} hrefPrefix={hrefPrefix} />;
            })}
        </div>
    );
}
