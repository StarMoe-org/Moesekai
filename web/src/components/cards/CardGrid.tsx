"use client";
import React from "react";
import { ICardInfo } from "@/types/types";
import CardItem from "./CardItem";
import { useI18n } from "@/contexts/I18nContext";
import { EmptyState } from "@/components/md3";
import { mdStyle } from "@/components/md3/icons";
import DatabaseTable from "./DatabaseTable";
import SekaiCardThumbnail from "./SekaiCardThumbnail";
import { TranslatedText } from "@/components/common/TranslatedText";
import { getCharacterName } from "@/lib/i18n";
import { getCardDefaultTrainedStatus, isTrainableCard } from "@/types/types";
import { useGridReflowAnimation } from "@/hooks/useGridReflowAnimation";

interface CardGridProps {
    cards: ICardInfo[];
    isLoading?: boolean;
    hrefPrefix?: string;
    view?: "grid" | "table";
}

// Loading skeleton component
function CardSkeleton() {
    return (
        <div className="rounded-md3-md overflow-hidden bg-surface-container-low animate-pulse">
            <div className="aspect-[4/5] bg-surface-container-high" />
            <div className="p-3 space-y-2">
                <div className="h-4 bg-surface-container-highest rounded-md3-xs w-3/4" />
                <div className="h-3 bg-surface-container-high rounded-md3-xs w-1/2" />
            </div>
        </div>
    );
}

export default function CardGrid({ cards, isLoading = false, hrefPrefix, view = "grid" }: CardGridProps) {
    const [now] = React.useState(() => Date.now());
    const { t, formatDate } = useI18n();
    const gridRef = useGridReflowAnimation<HTMLDivElement>();

    if (isLoading) {
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
        return <DatabaseTable thumbnailClassName="w-36" rows={cards.map(card => ({
            id: card.id,
            href: `${hrefPrefix ?? "/cards"}/${card.id}`,
            thumbnail: <div className="flex items-start justify-center gap-2">
                {(getCardDefaultTrainedStatus(card)
                    ? [true]
                    : isTrainableCard(card) && card.cardRarityType !== "rarity_birthday"
                        ? [false, true]
                        : [false]
                ).map((trained) => (
                    <div key={String(trained)} className="w-16 shrink-0 text-center">
                        <SekaiCardThumbnail card={card} trained={trained} className="w-16" />
                        <span className="mt-1 block type-label-s text-on-surface-variant">
                            {t(trained ? "page.cards.afterTrained" : "page.cards.beforeTrained")}
                        </span>
                    </div>
                ))}
            </div>,
            name: <TranslatedText original={card.prefix} category="cards" field="prefix" />,
            details: <><div>{getCharacterName(t, card.characterId)}</div><div>{formatDate(card.releaseAt || card.archivePublishedAt || 0)}</div>{(card.releaseAt || card.archivePublishedAt || 0) > now && <span className="text-tertiary">{t("common.badge.spoiler")}</span>}</>,
        }))} />;
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
