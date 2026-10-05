"use client";
import BaseFilters, { FilterSection, getFilterChipStateClasses } from "@/components/common/BaseFilters";
import CharacterFilter from "@/components/common/CharacterFilter";
import { GachaCategoryType } from "@/types/types";
import { useI18n } from "@/contexts/I18nContext";

interface GachaFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    sortBy: "id" | "startAt";
    sortOrder: "asc" | "desc";
    onSortChange: (sortBy: "id" | "startAt", sortOrder: "asc" | "desc") => void;
    // Category filter (wish_pick / normal_pickup)
    selectedCategory: GachaCategoryType;
    onCategoryChange: (category: GachaCategoryType) => void;
    // Character filter (for pickup characters)
    selectedCharacters: number[];
    onCharacterChange: (chars: number[]) => void;
    selectedUnitIds: string[];
    onUnitIdsChange: (units: string[]) => void;
    // Totals
    totalGachas: number;
    filteredGachas: number;
}

const SORT_OPTIONS_BASE = [
    { id: "id", labelKey: "common.filter.sortById" },
    { id: "startAt", labelKey: "common.filter.sortByStartAt" },
];

const GACHA_CATEGORIES: GachaCategoryType[] = ["all", "wish_pick", "normal_pickup"];

export default function GachaFilters({
    searchQuery,
    onSearchChange,
    sortBy,
    sortOrder,
    onSortChange,
    selectedCategory,
    onCategoryChange,
    selectedCharacters,
    onCharacterChange,
    selectedUnitIds,
    onUnitIdsChange,
    totalGachas,
    filteredGachas,
}: GachaFiltersProps) {
    const { t } = useI18n();
    const SORT_OPTIONS = SORT_OPTIONS_BASE.map(opt => ({
        id: opt.id,
        label: t(opt.labelKey),
    }));
    const hasActiveFilters = selectedCategory !== "all" || selectedCharacters.length > 0 || searchQuery.trim() !== "";

    return (
        <BaseFilters
            filteredCount={filteredGachas}
            totalCount={totalGachas}
            countUnit={t("page.gacha.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            searchPlaceholder={t("page.gacha.searchPlaceholder")}
            sortOptions={SORT_OPTIONS}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(id, order) => onSortChange(id as "id" | "startAt", order)}
            hasActiveFilters={hasActiveFilters}
            onReset={() => {
                onCategoryChange("all");
                onCharacterChange([]);
                onUnitIdsChange([]);
                onSearchChange("");
            }}
        >
            {/* Gacha Category Filter */}
            <FilterSection label={t("common.filter.gachaType")}>
                <div className="flex flex-wrap gap-2">
                    {GACHA_CATEGORIES.map(category => (
                        <button
                            key={category}
                            onClick={() => onCategoryChange(category)}
                            className={getFilterChipStateClasses(selectedCategory === category)}
                        >
                            {t(`common.gachaCategories.${category}`)}
                        </button>
                    ))}
                </div>
            </FilterSection>

            {/* Pickup Character Filter */}
            <CharacterFilter
                selectedCharacters={selectedCharacters}
                onCharacterChange={onCharacterChange}
                selectedUnitIds={selectedUnitIds}
                onUnitIdsChange={onUnitIdsChange}
                unitLabel={t("common.filter.unit")}
                characterLabel={t("common.filter.pickupCharacter")}
            />
        </BaseFilters>
    );
}
