"use client";
import React from "react";
import Image from "next/image";
import BaseFilters, { FilterSection, getFilterChipStateClasses, getFilterIconStateClasses } from "@/components/common/BaseFilters";
import CharacterFilter from "@/components/common/CharacterFilter";
import { CardRarityType, CardAttribute, ATTR_NAMES, SupportUnit, SUPPORT_UNIT_LABEL_KEYS, UNIT_ICON_FILES, UNIT_FIELD_TO_ID } from "@/types/types";
import { useCardSupplyTypeMapping } from "@/hooks/useCardSupplyType";
import { useSkillMapping } from "@/hooks/useSkillMapping";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SegmentedButton } from "@/components/md3";

interface CardFiltersProps {
    // Character filter
    selectedCharacters: number[];
    onCharacterChange: (chars: number[]) => void;

    // Unit filter
    selectedUnitIds: string[];
    onUnitIdsChange: (units: string[]) => void;

    // Attribute filter
    selectedAttrs: CardAttribute[];
    onAttrChange: (attrs: CardAttribute[]) => void;

    // Rarity filter
    selectedRarities: CardRarityType[];
    onRarityChange: (rarities: CardRarityType[]) => void;

    // Supply Type filter
    selectedSupplyTypes: string[];
    onSupplyTypeChange: (types: string[]) => void;

    // Support Unit filter (for Virtual Singers)
    selectedSupportUnits: SupportUnit[];
    onSupportUnitChange: (units: SupportUnit[]) => void;

    // Skill Type filter
    selectedSkillTypes: string[];
    onSkillTypeChange: (types: string[]) => void;

    // Search
    searchQuery: string;
    onSearchChange: (query: string) => void;

    // Sort
    sortBy: string;
    sortOrder: "asc" | "desc";
    onSortChange: (sortBy: string, sortOrder: "asc" | "desc") => void;

    // Extra sort options (e.g. for my-cards page)
    extraSortOptions?: { id: string; label: string }[];

    // Advanced-search syntax help panel (rendered via the "?" button)
    searchHelp?: React.ReactNode;

    // Reset
    onReset: () => void;

    // Card count
    totalCards: number;
    filteredCards: number;
}

const ATTRIBUTES: CardAttribute[] = ["cool", "cute", "happy", "mysterious", "pure"];
const RARITIES: { type: CardRarityType; num: number }[] = [
    { type: "rarity_1", num: 1 },
    { type: "rarity_2", num: 2 },
    { type: "rarity_3", num: 3 },
    { type: "rarity_4", num: 4 },
    { type: "rarity_birthday", num: 5 },
];

const ATTR_ICONS: Record<CardAttribute, string> = {
    "cool": "Cool.webp",
    "cute": "cute.webp",
    "happy": "Happy.webp",
    "mysterious": "Mysterious.webp",
    "pure": "Pure.webp",
};

const UNIT_ID_TO_SUPPORT_UNIT: Partial<Record<string, SupportUnit>> = {
    ln: "light_sound",
    mmj: "idol",
    vbs: "street",
    ws: "theme_park",
    "25ji": "school_refusal",
};

export default function CardFilters({
    selectedCharacters,
    onCharacterChange,
    selectedUnitIds,
    onUnitIdsChange,
    selectedAttrs,
    onAttrChange,
    selectedRarities,
    onRarityChange,
    selectedSupplyTypes,
    onSupplyTypeChange,
    selectedSupportUnits,
    onSupportUnitChange,
    selectedSkillTypes,
    onSkillTypeChange,
    searchQuery,
    onSearchChange,
    sortBy,
    sortOrder,
    onSortChange,
    extraSortOptions,
    searchHelp,
    onReset,
    totalCards,
    filteredCards,
}: CardFiltersProps) {

    const { t } = useI18n();
    const { useTrainedThumbnail, setUseTrainedThumbnail } = useTheme();
    const supplyTypes = useCardSupplyTypeMapping();
    const skillTypes = useSkillMapping();
    const getSupportUnitLabel = (unit: SupportUnit) => t(SUPPORT_UNIT_LABEL_KEYS[unit]);

    const SORT_OPTIONS = [
        { id: "id", label: t("common.filter.sortById") },
        { id: "releaseAt", label: t("common.filter.sortByDate") },
        { id: "rarity", label: t("common.filter.sortByRarity") },
    ];

    const toggleAttr = (attr: CardAttribute) => {
        if (selectedAttrs.includes(attr)) {
            onAttrChange(selectedAttrs.filter(a => a !== attr));
        } else {
            onAttrChange([...selectedAttrs, attr]);
        }
    };

    const toggleRarity = (rarity: CardRarityType) => {
        if (selectedRarities.includes(rarity)) {
            onRarityChange(selectedRarities.filter(r => r !== rarity));
        } else {
            onRarityChange([...selectedRarities, rarity]);
        }
    };

    const toggleSupplyType = (type: string) => {
        if (selectedSupplyTypes.includes(type)) {
            onSupplyTypeChange(selectedSupplyTypes.filter(t => t !== type));
        } else {
            onSupplyTypeChange([...selectedSupplyTypes, type]);
        }
    };

    const toggleSupportUnit = (unit: SupportUnit) => {
        if (selectedSupportUnits.includes(unit)) {
            onSupportUnitChange(selectedSupportUnits.filter(u => u !== unit));
        } else {
            onSupportUnitChange([...selectedSupportUnits, unit]);
        }
    };

    const handleUnitIdsChange = (nextUnitIds: string[]) => {
        const hasVsUnitSelected = nextUnitIds.includes("vs");
        const hadVsUnitSelected = selectedUnitIds.includes("vs");

        if (!hasVsUnitSelected) {
            const currentShortcutUnits = selectedUnitIds
                .map(unitId => UNIT_ID_TO_SUPPORT_UNIT[unitId])
                .filter((unit): unit is SupportUnit => Boolean(unit));
            const nextShortcutUnits = nextUnitIds
                .map(unitId => UNIT_ID_TO_SUPPORT_UNIT[unitId])
                .filter((unit): unit is SupportUnit => Boolean(unit));

            if (hadVsUnitSelected) {
                onSupportUnitChange(nextShortcutUnits);
            } else {
                const removedShortcutUnits = currentShortcutUnits.filter(unit => !nextShortcutUnits.includes(unit));
                const addedShortcutUnits = nextShortcutUnits.filter(unit => !currentShortcutUnits.includes(unit));

                const nextSupportUnits = [
                    ...selectedSupportUnits.filter(unit => !removedShortcutUnits.includes(unit)),
                    ...addedShortcutUnits,
                ];
                onSupportUnitChange([...new Set(nextSupportUnits)]);
            }
        }

        onUnitIdsChange(nextUnitIds);
    };

    const toggleSkillType = (type: string) => {
        if (selectedSkillTypes.includes(type)) {
            onSkillTypeChange(selectedSkillTypes.filter(t => t !== type));
        } else {
            onSkillTypeChange([...selectedSkillTypes, type]);
        }
    };

    const toggleVirtualSingerUnitTag = (supportUnit: SupportUnit) => {
        if (selectedSupportUnits.includes(supportUnit)) {
            onSupportUnitChange(selectedSupportUnits.filter(unit => unit !== supportUnit));
        } else {
            onSupportUnitChange([...new Set([...selectedSupportUnits, supportUnit])]);
        }
    };

    const showSupportUnitFilter = selectedUnitIds.includes("vs");

    const virtualSingerUnitTags = !showSupportUnitFilter
        ? selectedUnitIds
            .map(unitId => {
                const supportUnit = UNIT_ID_TO_SUPPORT_UNIT[unitId];
                if (!supportUnit) return null;

                return {
                    unitId,
                    supportUnit,
                    isSelected: selectedSupportUnits.includes(supportUnit),
                };
            })
            .filter((tag): tag is { unitId: string; supportUnit: SupportUnit; isSelected: boolean } => tag !== null)
        : [];

    const handleAllVirtualSingerTagsToggle = (selectAll: boolean) => {
        const visibleSupportUnits = virtualSingerUnitTags.map(tag => tag.supportUnit);
        if (selectAll) {
            onSupportUnitChange([...new Set([...selectedSupportUnits, ...visibleSupportUnits])]);
        } else {
            onSupportUnitChange(selectedSupportUnits.filter(unit => !visibleSupportUnits.includes(unit)));
        }
    };

    const hasActiveFilters =
        selectedCharacters.length > 0 ||
        selectedAttrs.length > 0 ||
        selectedRarities.length > 0 ||
        selectedSupplyTypes.length > 0 ||
        selectedSupportUnits.length > 0 ||
        selectedSkillTypes.length > 0 ||
        searchQuery.length > 0;

    const handleReset = () => {
        onReset();
    };

    return (
        <BaseFilters
            filteredCount={filteredCards}
            totalCount={totalCards}
            countUnit={t("page.cards.countUnit")}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            searchPlaceholder={t("page.cards.searchPlaceholder")}
            searchHelp={searchHelp}
            sortOptions={extraSortOptions ? [...SORT_OPTIONS, ...extraSortOptions] : SORT_OPTIONS}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(id, order) => onSortChange(id, order)}
            hasActiveFilters={hasActiveFilters}
            onReset={handleReset}
        >
            <FilterSection label={t("settings.trainedThumbnail.label")}>
                <SegmentedButton
                    aria-label={t("settings.trainedThumbnail.label")}
                    value={useTrainedThumbnail ? "trained" : "normal"}
                    onValueChange={(value) => setUseTrainedThumbnail(value === "trained")}
                    options={[
                        { value: "normal", label: t("page.cards.beforeTrained") },
                        { value: "trained", label: t("page.cards.afterTrained") },
                    ]}
                    className="w-full"
                />
            </FilterSection>
            {/* Unit & Character Selection */}
            <CharacterFilter
                selectedCharacters={selectedCharacters}
                onCharacterChange={onCharacterChange}
                selectedUnitIds={selectedUnitIds}
                onUnitIdsChange={handleUnitIdsChange}
                characterExtraButtons={virtualSingerUnitTags.map(({ unitId, supportUnit, isSelected }) => (
                    <button
                        key={`vs-subunit-${unitId}`}
                        onClick={() => toggleVirtualSingerUnitTag(supportUnit)}
                        className={`state-layer focus-ring relative rounded-full transition-[box-shadow,opacity] duration-150 ease-md3-standard ${isSelected
                            ? "z-10 ring-2 ring-primary ring-offset-2 ring-offset-surface"
                            : "ring-2 ring-transparent opacity-80 hover:opacity-100 hover:ring-outline-variant"
                            }`}
                        title={t("common.virtualSingerWithUnit", { unit: getSupportUnitLabel(supportUnit) })}
                    >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-high p-1.5">
                            <div className="w-full h-full relative">
                                <Image
                                    src={`/data/icon/${UNIT_ICON_FILES.vs}`}
                                    alt={t("common.virtualSingerWithUnit", { unit: getSupportUnitLabel(supportUnit) })}
                                    fill
                                    className="object-contain"
                                    unoptimized
                                />
                            </div>
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-surface-container-lowest shadow-elev-1 flex items-center justify-center">
                            <Image
                                src={`/data/icon/${UNIT_ICON_FILES[unitId]}`}
                                alt=""
                                width={12}
                                height={12}
                                className="object-contain"
                                unoptimized
                            />
                        </div>
                    </button>
                ))}
                characterExtraCount={virtualSingerUnitTags.length}
                selectedCharacterExtraCount={virtualSingerUnitTags.filter(tag => tag.isSelected).length}
                onCharacterExtraAllToggle={handleAllVirtualSingerTagsToggle}
            />

            {/* Support Unit Filter - Only show when VS unit is selected */}
            {showSupportUnitFilter && (
                <FilterSection label={t("common.filter.supportUnit")}>
                    <div className="flex flex-wrap gap-2">
                        {/* Ordered list: follows team order, then original (none) at end */}
                        {(["light_sound", "idol", "street", "theme_park", "school_refusal", "none"] as SupportUnit[]).map((unit) => {
                            const isSelected = selectedSupportUnits.includes(unit);
                            const unitIconMap: Record<SupportUnit, string> = {
                                "none": "vs.webp",
                                "light_sound": UNIT_ICON_FILES[UNIT_FIELD_TO_ID["light_sound"]],
                                "idol": UNIT_ICON_FILES[UNIT_FIELD_TO_ID["idol"]],
                                "school_refusal": UNIT_ICON_FILES[UNIT_FIELD_TO_ID["school_refusal"]],
                                "theme_park": UNIT_ICON_FILES[UNIT_FIELD_TO_ID["theme_park"]],
                                "street": UNIT_ICON_FILES[UNIT_FIELD_TO_ID["street"]],
                            };
                            const iconName = unitIconMap[unit];
                            return (
                                <button
                                    key={unit}
                                    onClick={() => toggleSupportUnit(unit)}
                                    className={`!p-1.5 ${getFilterIconStateClasses(isSelected)}`}
                                    title={getSupportUnitLabel(unit)}
                                >
                                    <div className="w-8 h-8 relative">
                                        <Image
                                            src={`/data/icon/${iconName}`}
                                            alt={getSupportUnitLabel(unit)}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </FilterSection>
            )}

            {/* Attribute and Rarity Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Attribute Filter */}
                <FilterSection label={t("common.filter.attribute")}>
                    <div className="flex flex-wrap gap-2">
                        {ATTRIBUTES.map((attr) => (
                            <button
                                key={attr}
                                onClick={() => toggleAttr(attr)}
                                className={`!p-1.5 ${getFilterIconStateClasses(selectedAttrs.includes(attr))}`}
                                title={ATTR_NAMES[attr]}
                            >
                                <div className="w-6 h-6 relative">
                                    <Image
                                        src={`/data/icon/${ATTR_ICONS[attr]}`}
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

                {/* Rarity Filter */}
                <FilterSection label={t("common.filter.rarity")}>
                    <div className="flex flex-wrap gap-2">
                        {RARITIES.map(({ type, num }) => {
                            const isSelected = selectedRarities.includes(type);
                            return (
                                <button
                                    key={type}
                                    onClick={() => toggleRarity(type)}
                                    className={`h-9 !gap-0.5 !px-2.5 ${getFilterChipStateClasses(isSelected)}`}
                                    title={type}
                                >
                                    {type === "rarity_birthday" ? (
                                        <div className="w-4 h-4 relative">
                                            <Image
                                                src="/data/icon/birthday.webp"
                                                alt="Birthday"
                                                fill
                                                className="object-contain"
                                                unoptimized
                                            />
                                        </div>
                                    ) : (
                                        Array.from({ length: num }).map((_, i) => (
                                            <div key={i} className="w-3 h-3 relative">
                                                <Image
                                                    src="/data/icon/star.webp"
                                                    alt="Star"
                                                    fill
                                                    className="object-contain"
                                                    unoptimized
                                                />
                                            </div>
                                        ))
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </FilterSection>
            </div>

            {/* Supply Type Filter */}
            <FilterSection label={t("common.filter.cardType")}>
                <div className="flex flex-wrap gap-2">
                    {supplyTypes.map((st) => {
                        const isSelected = selectedSupplyTypes.includes(st.type);
                        return (
                            <button
                                key={st.type}
                                onClick={() => toggleSupplyType(st.type)}
                                className={getFilterChipStateClasses(isSelected)}
                            >
                                {t(`common.cardSupplyTypes.${st.type}`)}
                            </button>
                        );
                    })}
                </div>
            </FilterSection>

            {/* Skill Type Filter */}
            <FilterSection label={t("common.filter.skillType")}>
                <div className="flex flex-wrap gap-2">
                    {skillTypes.map((sk) => {
                        const isSelected = selectedSkillTypes.includes(sk.descriptionSpriteName);
                        return (
                            <button
                                key={sk.descriptionSpriteName}
                                onClick={() => toggleSkillType(sk.descriptionSpriteName)}
                                className={getFilterChipStateClasses(isSelected)}
                            >
                                {t(`common.skillTypes.${sk.descriptionSpriteName}`)}
                            </button>
                        );
                    })}
                </div>
            </FilterSection>
        </BaseFilters>
    );
}
