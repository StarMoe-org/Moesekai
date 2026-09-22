"use client";

import React from "react";
import BaseFilters, { FilterButton, FilterSection, FilterToggle } from "@/components/common/BaseFilters";
import CharacterFilter from "@/components/common/CharacterFilter";
import { useI18n } from "@/contexts/I18nContext";
import type { MolyTab } from "@/lib/moly/contract";

interface InteractionsFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    tab: MolyTab;
    onTabChange: (tab: MolyTab) => void;
    selectedCharacters: number[];
    onCharacterChange: (chars: number[]) => void;
    selectedUnitIds: string[];
    onUnitIdsChange: (units: string[]) => void;
    availability: "all" | "ready";
    onAvailabilityChange: (availability: "all" | "ready") => void;
    totalCount: number;
    filteredCount: number;
    hasActiveFilters: boolean;
    onReset: () => void;
}

export default function InteractionsFilters({
    searchQuery,
    onSearchChange,
    tab,
    onTabChange,
    selectedCharacters,
    onCharacterChange,
    selectedUnitIds,
    onUnitIdsChange,
    availability,
    onAvailabilityChange,
    totalCount,
    filteredCount,
    hasActiveFilters,
    onReset,
}: InteractionsFiltersProps) {
    const { t } = useI18n();

    return (
        <BaseFilters
            title={t("page.mysekaiInteractions.filterTitle")}
            filteredCount={filteredCount}
            totalCount={totalCount}
            countUnit={t("page.mysekaiInteractions.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            searchPlaceholder={t("page.mysekaiInteractions.search")}
            hasActiveFilters={hasActiveFilters}
            onReset={onReset}
        >
            {/* Category / Scope Filter */}
            <FilterSection label={t("common.field.type")}>
                <div className="flex flex-wrap gap-2">
                    <FilterButton
                        selected={tab === "conversations"}
                        onClick={() => onTabChange("conversations")}
                        className="px-3 py-2 text-xs"
                    >
                        {t("page.mysekaiWorkspace.allConversations")}
                    </FilterButton>
                    <FilterButton
                        selected={tab === "performances"}
                        onClick={() => onTabChange("performances")}
                        className="px-3 py-2 text-xs"
                    >
                        {t("page.mysekaiWorkspace.furnitureTalks")}
                    </FilterButton>
                    <FilterButton
                        selected={tab === "activities"}
                        onClick={() => onTabChange("activities")}
                        className="px-3 py-2 text-xs"
                    >
                        {t("page.mysekaiWorkspace.activities")}
                    </FilterButton>
                </div>
            </FilterSection>

            {/* Character & Unit Filter */}
            <CharacterFilter
                selectedCharacters={selectedCharacters}
                onCharacterChange={onCharacterChange}
                selectedUnitIds={selectedUnitIds}
                onUnitIdsChange={onUnitIdsChange}
            />

            {/* Scene Availability Toggle */}
            <FilterToggle
                label={t("page.mysekaiWorkspace.sceneAvailable")}
                selected={availability === "ready"}
                onClick={() => onAvailabilityChange(availability === "ready" ? "all" : "ready")}
            />
        </BaseFilters>
    );
}
