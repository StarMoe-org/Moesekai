"use client";
import BaseFilters, { FilterSection, getFilterChipStateClasses } from "@/components/common/BaseFilters";
import { VirtualLiveType, VIRTUAL_LIVE_TYPE_COLORS } from "@/types/virtualLive";
import { useI18n } from "@/contexts/I18nContext";

interface VirtualLiveFiltersProps {
    selectedTypes: VirtualLiveType[];
    onTypeChange: (types: VirtualLiveType[]) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    sortBy: "id" | "startAt";
    sortOrder: "asc" | "desc";
    onSortChange: (sortBy: "id" | "startAt", sortOrder: "asc" | "desc") => void;
    onReset: () => void;
    totalItems: number;
    filteredItems: number;
}

const VIRTUAL_LIVE_TYPES: VirtualLiveType[] = ["normal", "beginner", "archive", "cheerful_carnival", "connect_live", "streaming"];

const SORT_OPTIONS_BASE = [
    { id: "id", labelKey: "common.filter.sortById" },
    { id: "startAt", labelKey: "common.filter.sortByStartAt" },
];

export default function VirtualLiveFilters({
    selectedTypes,
    onTypeChange,
    searchQuery,
    onSearchChange,
    sortBy,
    sortOrder,
    onSortChange,
    onReset,
    totalItems,
    filteredItems,
}: VirtualLiveFiltersProps) {
    const { t } = useI18n();
    const SORT_OPTIONS = SORT_OPTIONS_BASE.map(opt => ({
        id: opt.id,
        label: t(opt.labelKey),
    }));

    const toggleType = (type: VirtualLiveType) => {
        if (selectedTypes.includes(type)) {
            onTypeChange(selectedTypes.filter(t => t !== type));
        } else {
            onTypeChange([...selectedTypes, type]);
        }
    };

    const hasActiveFilters = selectedTypes.length > 0 || searchQuery.trim() !== "";

    return (
        <BaseFilters
            filteredCount={filteredItems}
            totalCount={totalItems}
            countUnit={t("page.live.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            searchPlaceholder={t("page.live.searchPlaceholder")}
            sortOptions={SORT_OPTIONS}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(id, order) => onSortChange(id as "id" | "startAt", order)}
            hasActiveFilters={hasActiveFilters}
            onReset={onReset}
        >
            {/* Virtual Live Type Filter */}
            <FilterSection label={t("common.filter.virtualLiveType")}>
                <div className="flex flex-wrap gap-2">
                    {VIRTUAL_LIVE_TYPES.map(type => (
                        <button
                            key={type}
                            onClick={() => toggleType(type)}
                            className={selectedTypes.includes(type)
                                ? `${getFilterChipStateClasses(true)} text-white shadow-elev-1`
                                : getFilterChipStateClasses(false)}
                            style={selectedTypes.includes(type) ? { backgroundColor: VIRTUAL_LIVE_TYPE_COLORS[type] } : {}}
                        >
                            {t(`common.virtualLiveTypes.${type}`)}
                        </button>
                    ))}
                </div>
            </FilterSection>
        </BaseFilters>
    );
}
