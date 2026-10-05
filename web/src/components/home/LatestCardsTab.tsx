"use client";
import { useState, useEffect } from "react";
import { Button, ErrorState } from "@/components/md3";
import { mdChevronRight } from "@/components/md3/icons";
import { ICardInfo } from "@/types/types";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchMasterData } from "@/lib/fetch";
import CardItem from "@/components/cards/CardItem";
import { useI18n } from "@/contexts/I18nContext";

export default function LatestCardsTab() {
    const { isShowSpoiler } = useTheme();
    const { t } = useI18n();
    const [cards, setCards] = useState<ICardInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);
                // We don't need translations here as CardItem handles it internally
                const cardsData = await fetchMasterData<ICardInfo[]>("cards.json");

                // Filter and sort by releaseAt
                const now = Date.now();
                const filteredCards = cardsData
                    .filter(card => isShowSpoiler || (card.releaseAt || card.archivePublishedAt || 0) <= now)
                    .sort((a, b) => (b.releaseAt || 0) - (a.releaseAt || 0))
                    .slice(0, 6);

                setCards(filteredCards);
                setError(null);
            } catch (err) {
                console.error("Error fetching cards data:", err);
                setError(err instanceof Error ? err.message : t("common.state.loadingFailed"));
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [isShowSpoiler, t]);

    if (isLoading) {
        return (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="animate-pulse">
                        <div className="aspect-square rounded-md3-md bg-surface-container-high" />
                        <div className="mt-2 h-3 bg-surface-container-high rounded-md3-xs w-3/4" />
                    </div>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <ErrorState title={t("page.home.latestCards.loadFailedTitle")} message={error} />
        );
    }

    if (cards.length === 0) {
        return (
            <div className="p-8 text-center text-on-surface-variant bg-surface-container-low rounded-md3-xl">
                <p className="type-body-l">{t("page.home.latestCards.noData")}</p>
            </div>
        );
    }

    return (
        <div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {cards.map((card) => {
                    const now = Date.now();
                    const isSpoiler = (card.releaseAt || card.archivePublishedAt || 0) > now;
                    return <CardItem key={card.id} card={card} isSpoiler={isSpoiler} />;
                })}
            </div>
            {/* View All Link */}
            <div className="mt-4 text-center">
                <Button variant="text" trailingIcon={mdChevronRight} href="/cards">
                    {t("page.home.latestCards.viewAll")}
                </Button>
            </div>
        </div>
    );
}
