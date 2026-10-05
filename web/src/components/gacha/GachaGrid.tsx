"use client";
import React from "react";
import GachaItem from "./GachaItem";
import { IGachaInfo } from "@/types/types";
import { useI18n } from "@/contexts/I18nContext";
import { EmptyState } from "@/components/md3";
import { mdDeployedCode } from "@/components/md3/icons";

interface GachaGridProps {
    gachas: IGachaInfo[];
    isLoading?: boolean;
}

// Skeleton component for loading state
function GachaSkeleton() {
    return (
        <div className="rounded-md3-md overflow-hidden bg-surface-container-low animate-pulse">
            <div className="aspect-[16/9] bg-surface-container-highest" />
            <div className="p-3 space-y-2">
                <div className="h-4 bg-surface-container-highest rounded-md3-xs w-3/4" />
                <div className="h-3 bg-surface-container-highest rounded-md3-xs w-1/2" />
            </div>
        </div>
    );
}

export default function GachaGrid({ gachas, isLoading = false }: GachaGridProps) {
    const { t } = useI18n();

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                    <GachaSkeleton key={i} />
                ))}
            </div>
        );
    }

    if (gachas.length === 0) {
        return <EmptyState icon={mdDeployedCode} title={t("page.gacha.noResult")} description={t("page.gacha.noResultHint")} />;
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {gachas.map((gacha) => (
                <GachaItem key={gacha.id} gacha={gacha} />
            ))}
        </div>
    );
}
