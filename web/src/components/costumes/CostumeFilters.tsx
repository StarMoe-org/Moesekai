"use client";
import React from "react";
import BaseFilters, { FilterSection, FilterButton, FilterToggle } from "@/components/common/BaseFilters";
import CharacterFilter from "@/components/common/CharacterFilter";
import { useI18n } from "@/contexts/I18nContext";
import {
    PART_TYPE_IDS,
    SOURCE_IDS,
    RARITY_IDS,
    PART_TYPE_LABEL_KEYS,
    SOURCE_LABEL_KEYS,
    RARITY_LABEL_KEYS,
} from "@/types/costume";

interface CostumeFiltersProps {
    // Character filter
    selectedCharacters: number[];
    onCharacterChange: (chars: number[]) => void;

    // Unit filter
    selectedUnitIds: string[];
    onUnitIdsChange: (units: string[]) => void;

    // Part filter
    selectedPartTypes: string[];
    onPartTypeChange: (types: string[]) => void;

    // Source filter
    selectedSources: string[];
    onSourceChange: (sources: string[]) => void;

    // Rarity filter
    selectedRarities: string[];
    onRarityChange: (rarities: string[]) => void;

    // Gender filter
    selectedGenders: string[];
    onGenderChange: (genders: string[]) => void;

    // Related Card Filter
    onlyRelatedCardCostumes: boolean;
    onOnlyRelatedCardCostumesChange: (val: boolean) => void;

    // Search
    searchQuery: string;
    onSearchChange: (query: string) => void;

    // Sort
    sortBy: string;
    sortOrder: "asc" | "desc";
    onSortChange: (sortBy: string, sortOrder: "asc" | "desc") => void;

    // Reset
    onReset: () => void;

    // Counts
    totalCount: number;
    filteredCount: number;
}

export default function CostumeFilters({
    selectedCharacters,
    onCharacterChange,
    selectedUnitIds,
    onUnitIdsChange,
    selectedPartTypes,
    onPartTypeChange,
    selectedSources,
    onSourceChange,
    selectedRarities,
    onRarityChange,
    selectedGenders,
    onGenderChange,
    onlyRelatedCardCostumes,
    onOnlyRelatedCardCostumesChange,
    searchQuery,
    onSearchChange,
    sortBy,
    sortOrder,
    onSortChange,
    onReset,
    totalCount,
    filteredCount,
}: CostumeFiltersProps) {
    const { t } = useI18n();

    const togglePartType = (type: string) => {
        if (selectedPartTypes.includes(type)) {
            onPartTypeChange(selectedPartTypes.filter(t => t !== type));
        } else {
            onPartTypeChange([...selectedPartTypes, type]);
        }
    };

    const toggleSource = (source: string) => {
        if (selectedSources.includes(source)) {
            onSourceChange(selectedSources.filter(s => s !== source));
        } else {
            onSourceChange([...selectedSources, source]);
        }
    };

    const toggleRarity = (rarity: string) => {
        if (selectedRarities.includes(rarity)) {
            onRarityChange(selectedRarities.filter(r => r !== rarity));
        } else {
            onRarityChange([...selectedRarities, rarity]);
        }
    };

    const toggleGender = (gender: string) => {
        if (selectedGenders.includes(gender)) {
            onGenderChange(selectedGenders.filter(g => g !== gender));
        } else {
            onGenderChange([...selectedGenders, gender]);
        }
    };

    const hasActiveFilters =
        selectedCharacters.length > 0 ||
        selectedPartTypes.length > 0 ||
        selectedSources.length > 0 ||
        selectedRarities.length > 0 ||
        selectedGenders.length > 0 ||
        onlyRelatedCardCostumes ||
        searchQuery.length > 0;

    const handleReset = () => {
        onReset();
    };

    return (
        <BaseFilters
            title={t("page.costumes.filterTitleAlt")}
            filteredCount={filteredCount}
            totalCount={totalCount}
            countUnit={t("page.costumes.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            searchPlaceholder={t("page.costumes.searchPlaceholder")}
            sortOptions={[
                { id: "id", label: t("page.costumes.sortOptions.id") },
                { id: "publishedAt", label: t("page.costumes.sortOptions.publishedAt") },
            ]}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(field, order) => onSortChange(field, order)}
            hasActiveFilters={hasActiveFilters}
            onReset={handleReset}
        >
            {/* Unit & Character Selection */}
            <CharacterFilter
                selectedCharacters={selectedCharacters}
                onCharacterChange={onCharacterChange}
                selectedUnitIds={selectedUnitIds}
                onUnitIdsChange={onUnitIdsChange}
                extraContent={
                    selectedCharacters.length > 0 ? (
                        <div className="mt-3">
                            <FilterToggle
                                selected={onlyRelatedCardCostumes}
                                onClick={() => onOnlyRelatedCardCostumesChange(!onlyRelatedCardCostumes)}
                                label={t("page.costumes.onlyRelatedCardCostumes")}
                            />
                        </div>
                    ) : undefined
                }
            />

            {/* Part Type and Source Filters */}
            <div className="grid grid-cols-1 gap-4">
                <FilterSection label={t("page.costumes.sectionLabel.partType")}>
                    <div className="flex flex-wrap gap-2">
                        {PART_TYPE_IDS.map((key) => (
                            <FilterButton
                                key={key}
                                selected={selectedPartTypes.includes(key)}
                                onClick={() => togglePartType(key)}
                            >
                                {t(PART_TYPE_LABEL_KEYS[key])}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>

                <FilterSection label={t("page.costumes.sectionLabel.source")}>
                    <div className="flex flex-wrap gap-2">
                        {SOURCE_IDS.map((key) => (
                            <FilterButton
                                key={key}
                                selected={selectedSources.includes(key)}
                                onClick={() => toggleSource(key)}
                            >
                                {t(SOURCE_LABEL_KEYS[key])}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>
            </div>

            {/* Rarity & Gender: stacked, the filter sheet is too narrow for two columns of chips. */}
            <div className="space-y-5">
                <FilterSection label={t("page.costumes.sectionLabel.rarity")}>
                    <div className="flex flex-wrap gap-2">
                        {RARITY_IDS.map((key) => (
                            <FilterButton
                                key={key}
                                selected={selectedRarities.includes(key)}
                                onClick={() => toggleRarity(key)}
                            >
                                {t(RARITY_LABEL_KEYS[key])}
                            </FilterButton>
                        ))}
                    </div>
                </FilterSection>

                <FilterSection label={t("page.costumes.sectionLabel.gender")}>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton
                            selected={selectedGenders.includes("female")}
                            onClick={() => toggleGender("female")}
                        >
                            {t("common.costume.genders.female")}
                        </FilterButton>
                        <FilterButton
                            selected={selectedGenders.includes("male")}
                            onClick={() => toggleGender("male")}
                        >
                            {t("common.costume.genders.male")}
                        </FilterButton>
                    </div>
                </FilterSection>
            </div>

        </BaseFilters>
    );
}
