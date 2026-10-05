"use client";
import Image from "next/image";
import BaseFilters, { FilterSection, getFilterChipStateClasses, getFilterIconStateClasses } from "@/components/common/BaseFilters";
import CharacterFilter from "@/components/common/CharacterFilter";
import { EventType, EVENT_TYPE_COLORS } from "@/types/events";
import { ICharaUnitInfo, UNIT_DATA, UNIT_ICON_FILES, UNIT_ID_LABEL_KEYS, CardAttribute, ATTR_NAMES, ATTR_ICON_PATHS, ATTR_COLORS } from "@/types/types";
import { useI18n } from "@/contexts/I18nContext";
import { cn } from "@/components/md3";

/** Filter IDs for event unit (group) filter */
export type EventUnitFilterId = "ln" | "mmj" | "vbs" | "ws" | "25ji" | "vs" | "mixed";

export const EVENT_UNIT_FILTERS: { id: EventUnitFilterId; labelKey: string; fallbackName: string; icon?: string }[] = [
    ...UNIT_DATA.map(u => ({
        id: u.id as EventUnitFilterId,
        labelKey: UNIT_ID_LABEL_KEYS[u.id] ?? `common.units.${u.id}`,
        fallbackName: u.name,
        icon: UNIT_ICON_FILES[u.id],
    })),
    { id: "mixed", labelKey: "common.units.mixed", fallbackName: "Mixed" },
];

/** Map raw event_type from actionSets to filter ID */
export const EVENT_TYPE_TO_FILTER_ID: Record<string, EventUnitFilterId> = {
    band: "ln",
    idol: "mmj",
    street: "vbs",
    wonder: "ws",
    night: "25ji",
    piapro: "vs",
};

interface EventFiltersProps {
    selectedTypes: EventType[];
    onTypeChange: (types: EventType[]) => void;

    // Event unit (group) filter (optional — only used on events list page)
    selectedEventUnits?: EventUnitFilterId[];
    onEventUnitChange?: (units: EventUnitFilterId[]) => void;

    // Character filter (bonus characters)
    selectedCharacters: number[];
    onCharacterChange: (chars: number[]) => void;
    selectedUnitIds: string[];
    onUnitIdsChange: (units: string[]) => void;
    charaUnits?: ICharaUnitInfo[];

    // Banner character filter (optional)
    selectedBannerChars?: number[];
    onBannerCharsChange?: (chars: number[]) => void;
    selectedBannerUnitIds?: string[];
    onBannerUnitIdsChange?: (units: string[]) => void;

    // Bonus attribute filter (optional)
    selectedBonusAttr?: CardAttribute | null;
    onBonusAttrChange?: (attr: CardAttribute | null) => void;

    searchQuery: string;
    onSearchChange: (query: string) => void;
    sortBy: "id" | "startAt";
    sortOrder: "asc" | "desc";
    onSortChange: (sortBy: "id" | "startAt", sortOrder: "asc" | "desc") => void;
    onReset: () => void;
    totalEvents: number;
    filteredEvents: number;
}

const EVENT_TYPES: EventType[] = ["marathon", "cheerful_carnival", "world_bloom"];

const SORT_OPTIONS_BASE = [
    { id: "id", labelKey: "common.filter.sortById" },
    { id: "startAt", labelKey: "common.filter.sortByStartAt" },
];

export default function EventFilters({
    selectedTypes,
    onTypeChange,
    selectedEventUnits,
    onEventUnitChange,
    selectedCharacters,
    onCharacterChange,
    selectedUnitIds,
    onUnitIdsChange,
    charaUnits,
    selectedBannerChars,
    onBannerCharsChange,
    selectedBannerUnitIds,
    onBannerUnitIdsChange,
    selectedBonusAttr,
    onBonusAttrChange,
    searchQuery,
    onSearchChange,
    sortBy,
    sortOrder,
    onSortChange,
    onReset,
    totalEvents,
    filteredEvents,
}: EventFiltersProps) {
    const { t } = useI18n();
    const SORT_OPTIONS = SORT_OPTIONS_BASE.map(opt => ({
        id: opt.id,
        label: t(opt.labelKey),
    }));
    const getEventUnitName = (unit: { labelKey: string; fallbackName: string }) => {
        const label = t(unit.labelKey);
        return label === unit.labelKey ? unit.fallbackName : label;
    };

    const toggleType = (type: EventType) => {
        if (selectedTypes.includes(type)) {
            onTypeChange(selectedTypes.filter(t => t !== type));
        } else {
            onTypeChange([...selectedTypes, type]);
        }
    };

    const toggleEventUnit = (unitId: EventUnitFilterId) => {
        if (!onEventUnitChange || !selectedEventUnits) return;
        if (selectedEventUnits.includes(unitId)) {
            onEventUnitChange(selectedEventUnits.filter(u => u !== unitId));
        } else {
            onEventUnitChange([...selectedEventUnits, unitId]);
        }
    };

    const hasActiveFilters = selectedTypes.length > 0 || (selectedEventUnits && selectedEventUnits.length > 0) || selectedCharacters.length > 0 || (selectedBannerChars && selectedBannerChars.length > 0) || !!selectedBonusAttr || searchQuery.trim() !== "";

    return (
        <BaseFilters
            filteredCount={filteredEvents}
            totalCount={totalEvents}
            countUnit={t("page.events.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            searchPlaceholder={t("page.events.searchPlaceholder")}
            sortOptions={SORT_OPTIONS}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(id, order) => onSortChange(id as "id" | "startAt", order)}
            hasActiveFilters={hasActiveFilters}
            onReset={onReset}
        >
            {/* Event Unit (Group) Filter — only shown when props are provided */}
            {selectedEventUnits && onEventUnitChange && (
                <FilterSection label={t("common.filter.eventUnit")}>
                    <div className="flex flex-wrap gap-2">
                        {EVENT_UNIT_FILTERS.map(unit => (
                            <button
                                key={unit.id}
                                onClick={() => toggleEventUnit(unit.id)}
                                className={`!p-1.5 ${getFilterIconStateClasses(selectedEventUnits.includes(unit.id))}`}
                                title={getEventUnitName(unit)}
                            >
                                {unit.icon ? (
                                    <div className="w-8 h-8 relative">
                                        <Image
                                            src={`/data/icon/${unit.icon}`}
                                            alt={getEventUnitName(unit)}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container-high">
                                        <span className="type-label-s">{t("common.badge.mixed")}</span>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </FilterSection>
            )}

            {/* Banner Character Filter */}
            {selectedBannerChars && onBannerCharsChange && selectedBannerUnitIds && onBannerUnitIdsChange && (
                <CharacterFilter
                    selectedCharacters={selectedBannerChars}
                    onCharacterChange={onBannerCharsChange}
                    selectedUnitIds={selectedBannerUnitIds}
                    onUnitIdsChange={onBannerUnitIdsChange}
                    unitLabel={t("common.filter.bannerCharacter")}
                    characterLabel={t("common.filter.bannerCharacter")}
                />
            )}

            {/* Event Type Filter */}
            <FilterSection label={t("common.filter.eventType")}>
                <div className="flex flex-wrap gap-2">
                    {EVENT_TYPES.map(type => (
                        <button
                            key={type}
                            onClick={() => toggleType(type)}
                            className={selectedTypes.includes(type)
                                ? cn(getFilterChipStateClasses(true), "text-white shadow-elev-1")
                                : getFilterChipStateClasses(false)}
                            style={selectedTypes.includes(type) ? { backgroundColor: EVENT_TYPE_COLORS[type] } : {}}
                        >
                            {t(`common.eventTypes.${type}`)}
                        </button>
                    ))}
                </div>
            </FilterSection>

            {/* Bonus Character Filter */}
            <CharacterFilter
                selectedCharacters={selectedCharacters}
                onCharacterChange={onCharacterChange}
                selectedUnitIds={selectedUnitIds}
                onUnitIdsChange={onUnitIdsChange}
                unitLabel={t("common.filter.bonusCharacter")}
                characterLabel={t("common.filter.bonusCharacter")}
                charaUnits={charaUnits}
            />

            {/* Bonus Attribute Filter */}
            {onBonusAttrChange && (
                <FilterSection label={t("common.filter.bonusAttribute")}>
                    <div className="flex flex-wrap gap-2">
                        {(["cool", "cute", "happy", "mysterious", "pure"] as CardAttribute[]).map(attr => (
                            <button
                                key={attr}
                                onClick={() => onBonusAttrChange(selectedBonusAttr === attr ? null : attr)}
                                className={`!p-1.5 ${getFilterIconStateClasses(selectedBonusAttr === attr)}`}
                                style={selectedBonusAttr === attr ? { boxShadow: `0 0 0 2px ${ATTR_COLORS[attr]}` } : {}}
                                title={ATTR_NAMES[attr]}
                            >
                                <div className="w-7 h-7 relative">
                                    <Image
                                        src={`/data/icon/${ATTR_ICON_PATHS[attr]}`}
                                        alt={ATTR_NAMES[attr]}
                                        fill
                                        className="object-contain"
                                        unoptimized
                                    />
                                </div>
                            </button>
                        ))}
                    </div>
                </FilterSection>
            )}
        </BaseFilters>
    );
}
