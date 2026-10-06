"use client";
import React from "react";
import GachaItem from "./GachaItem";
import { IGachaInfo } from "@/types/types";
import { useI18n } from "@/contexts/I18nContext";
import { EmptyState } from "@/components/md3";
import { mdDeployedCode } from "@/components/md3/icons";
import DatabaseTable from "@/components/cards/DatabaseTable";
import Image from "next/image";
import { useTheme } from "@/contexts/ThemeContext";
import { getGachaLogoUrl } from "@/lib/assets";
import { TranslatedText } from "@/components/common/TranslatedText";

interface GachaGridProps {
    gachas: IGachaInfo[];
    isLoading?: boolean;
    view?: "grid" | "table";
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

export default function GachaGrid({ gachas, isLoading = false, view = "grid" }: GachaGridProps) {
    const { t, formatDate } = useI18n();
    const { assetSource } = useTheme();
    const [now] = React.useState(() => Date.now());

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

    if (view === "table") {
        return <DatabaseTable rows={gachas.map(gacha => ({
            id: gacha.id,
            href: `/gacha/${gacha.id}`,
            thumbnail: <Image src={getGachaLogoUrl(gacha.assetbundleName, assetSource)} alt={gacha.name} fill className="object-contain" unoptimized />,
            name: <TranslatedText original={gacha.name} category="gacha" field="name" />,
            details: <><div className="whitespace-nowrap">{formatDate(gacha.startAt)} ~ {formatDate(gacha.endAt)}</div>{gacha.startAt > now ? <span className="text-tertiary">{t("common.badge.spoiler")}</span> : gacha.endAt >= now && <span className="text-primary">{t("common.badge.ongoing")}</span>}</>,
        }))} />;
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {gachas.map((gacha) => (
                <GachaItem key={gacha.id} gacha={gacha} />
            ))}
        </div>
    );
}
