"use client";
import React, { useMemo } from "react";
import Image from "next/image";
import { FilterSection } from "@/components/common/BaseFilters";
import { cn } from "@/components/md3";
import { UNIT_DATA, UNIT_ICON_FILES, UNIT_FIELD_TO_ID, UNIT_ID_LABEL_KEYS, ICharaUnitInfo } from "@/types/types";
import { getCharacterIconUrl } from "@/lib/assets";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";

interface CharacterFilterProps {
    selectedCharacters: number[];
    onCharacterChange: (chars: number[]) => void;
    selectedUnitIds: string[];
    onUnitIdsChange: (units: string[]) => void;
    /** Label for the unit section, defaults to t("common.filter.unit") */
    unitLabel?: string;
    /** Label for the character section, defaults to t("common.filter.character") */
    characterLabel?: string;
    /** Extra buttons rendered inside the character row, before the ALL button */
    characterExtraButtons?: React.ReactNode;
    /** Count of extra buttons participating in the ALL selection */
    characterExtraCount?: number;
    /** Number of selected extra buttons participating in the ALL selection */
    selectedCharacterExtraCount?: number;
    /** Called when ALL should also toggle the extra buttons */
    onCharacterExtraAllToggle?: (selectAll: boolean) => void;
    /** Extra content rendered below the character list inside the character FilterSection */
    extraContent?: React.ReactNode;
    /** When provided, enables event mode: VS sub-unit chars are placed into their respective groups */
    charaUnits?: ICharaUnitInfo[];
}

interface DisplayChar {
    /** The ID used for selection (gameCharacterUnitId) */
    id: number;
    /** The base character ID (for icon/name lookup) */
    baseCharId: number;
    /** The unit this char belongs to in the filter (null = no badge needed) */
    badgeUnitId: string | null;
}

export default function CharacterFilter({
    selectedCharacters,
    onCharacterChange,
    selectedUnitIds,
    onUnitIdsChange,
    unitLabel,
    characterLabel,
    characterExtraButtons,
    characterExtraCount = 0,
    selectedCharacterExtraCount = 0,
    onCharacterExtraAllToggle,
    extraContent,
    charaUnits,
}: CharacterFilterProps) {
    const { t } = useI18n();
    const resolvedUnitLabel = unitLabel ?? t("common.filter.unit");
    const resolvedCharacterLabel = characterLabel ?? t("common.filter.character");
    // Build event-mode unit data: remap VS sub-unit chars into their respective groups
    const { effectiveUnitData, charDisplayMap } = useMemo(() => {
        if (!charaUnits || charaUnits.length === 0) {
            // Default mode: use UNIT_DATA as-is, all chars use their own ID
            const displayMap = new Map<number, DisplayChar>();
            for (const unit of UNIT_DATA) {
                for (const cid of unit.charIds) {
                    displayMap.set(cid, { id: cid, baseCharId: cid, badgeUnitId: null });
                }
            }
            return { effectiveUnitData: UNIT_DATA, charDisplayMap: displayMap };
        }

        // Event mode: build new unit groups
        const displayMap = new Map<number, DisplayChar>();
        const unitCharMap = new Map<string, number[]>(); // unitId -> charIds for display

        // Initialize with original character groups (non-VS)
        for (const unit of UNIT_DATA) {
            if (unit.id === "vs") continue;
            unitCharMap.set(unit.id, [...unit.charIds]);
            for (const cid of unit.charIds) {
                displayMap.set(cid, { id: cid, baseCharId: cid, badgeUnitId: null });
            }
        }
        // VS group: only original VS chars (unit === "piapro")
        unitCharMap.set("vs", []);

        for (const cu of charaUnits) {
            if (cu.gameCharacterId < 21 || cu.gameCharacterId > 26) continue; // skip non-VS
            const mappedUnitId = UNIT_FIELD_TO_ID[cu.unit];
            if (!mappedUnitId) continue;

            if (cu.unit === "piapro") {
                // Original VS character
                unitCharMap.get("vs")!.push(cu.id); // cu.id === cu.gameCharacterId for piapro originals (21-26)
                displayMap.set(cu.id, { id: cu.id, baseCharId: cu.gameCharacterId, badgeUnitId: null });
            } else {
                // Sub-unit VS character
                const targetGroup = unitCharMap.get(mappedUnitId);
                if (targetGroup) {
                    targetGroup.push(cu.id);
                }
                displayMap.set(cu.id, { id: cu.id, baseCharId: cu.gameCharacterId, badgeUnitId: mappedUnitId });
            }
        }

        const newUnitData = UNIT_DATA.map(unit => ({
            ...unit,
            charIds: unitCharMap.get(unit.id) || unit.charIds,
        }));

        return { effectiveUnitData: newUnitData, charDisplayMap: displayMap };
    }, [charaUnits]);

    const toggleCharacter = (id: number) => {
        if (selectedCharacters.includes(id)) {
            onCharacterChange(selectedCharacters.filter(c => c !== id));
        } else {
            onCharacterChange([...selectedCharacters, id]);
        }
    };

    const handleUnitClick = (unitId: string) => {
        const unit = effectiveUnitData.find(u => u.id === unitId);
        if (!unit) return;

        if (selectedUnitIds.includes(unitId)) {
            onUnitIdsChange(selectedUnitIds.filter(id => id !== unitId));
            const newChars = selectedCharacters.filter(c => !unit.charIds.includes(c));
            onCharacterChange(newChars);
        } else {
            onUnitIdsChange([...selectedUnitIds, unitId]);
            const newChars = [...new Set([...selectedCharacters, ...unit.charIds])];
            onCharacterChange(newChars);
        }
    };

    const currentUnits = selectedUnitIds.length > 0
        ? effectiveUnitData.filter(u => selectedUnitIds.includes(u.id))
        : [];

    const displayedCharacters = currentUnits.length > 0
        ? currentUnits.flatMap(u => u.charIds)
        : [...new Set(selectedCharacters)];

    const allCharactersSelected = displayedCharacters.length > 0 &&
        displayedCharacters.every(charId => selectedCharacters.includes(charId));
    const allExtraSelected = characterExtraCount === 0 || selectedCharacterExtraCount === characterExtraCount;
    const allSelected = allCharactersSelected && allExtraSelected;

    const handleAllClick = () => {
        if (allSelected) {
            const newChars = selectedCharacters.filter(charId => !displayedCharacters.includes(charId));
            onCharacterChange(newChars);
            onCharacterExtraAllToggle?.(false);
        } else {
            const newChars = [...new Set([...selectedCharacters, ...displayedCharacters])];
            onCharacterChange(newChars);
            onCharacterExtraAllToggle?.(true);
        }
    };

    const getCharName = (charId: number): string => {
        const display = charDisplayMap.get(charId);
        const baseName = display
            ? getCharacterName(t, display.baseCharId)
            : getCharacterName(t, charId);
        // For VS sub-unit characters, append the localized group name.
        if (display?.badgeUnitId) {
            const groupNameKey = UNIT_ID_LABEL_KEYS[display.badgeUnitId];
            if (groupNameKey) return `${baseName} (${t(groupNameKey)})`;
        }
        return baseName;
    };

    const getCharIconId = (charId: number): number => {
        const display = charDisplayMap.get(charId);
        return display ? display.baseCharId : charId;
    };

    const getCharBadge = (charId: number): string | null => {
        const display = charDisplayMap.get(charId);
        return display?.badgeUnitId || null;
    };

    return (
        <>
            {/* Unit Selection */}
            <FilterSection label={resolvedUnitLabel}>
                <div className="flex flex-wrap gap-2">
                    {effectiveUnitData.map(unit => {
                        const iconName = UNIT_ICON_FILES[unit.id] || "";
                        const unitLabel = t(UNIT_ID_LABEL_KEYS[unit.id] ?? `common.units.${unit.id}`);
                        return (
                            <button
                                key={unit.id}
                                onClick={() => handleUnitClick(unit.id)}
                                type="button"
                                aria-pressed={selectedUnitIds.includes(unit.id)}
                                className={cn(
                                    "state-layer focus-ring cursor-pointer rounded-md3-md border p-1.5 transition-[background-color,border-radius] duration-200 ease-md3-standard",
                                    selectedUnitIds.includes(unit.id)
                                        ? "rounded-md3-lg border-transparent bg-secondary-container ring-2 ring-primary"
                                        : "border-transparent bg-surface-container-high",
                                )}
                                title={unitLabel}
                            >
                                <div className="w-8 h-8 relative">
                                    <Image
                                        src={`/data/icon/${iconName}`}
                                        alt={unitLabel}
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

            {/* Character Selection */}
            {(currentUnits.length > 0 || selectedCharacters.length > 0) && (
                <FilterSection label={resolvedCharacterLabel}>
                    <div className="flex flex-wrap gap-2">
                        {displayedCharacters.map(charId => {
                            const badgeUnitId = getCharBadge(charId);
                            const badgeIcon = badgeUnitId ? UNIT_ICON_FILES[badgeUnitId] : null;
                            const charName = getCharName(charId);
                            return (
                                <button
                                    key={charId}
                                    onClick={() => toggleCharacter(charId)}
                                    type="button"
                                    aria-pressed={selectedCharacters.includes(charId)}
                                    className={cn(
                                        "focus-ring relative cursor-pointer rounded-full p-0.5 transition-[background-color,box-shadow,opacity] duration-200 ease-md3-standard",
                                        selectedCharacters.includes(charId)
                                            ? "z-10 bg-secondary-container ring-2 ring-primary"
                                            : "opacity-80 ring-2 ring-transparent hover:opacity-100 hover:ring-outline-variant",
                                    )}
                                    title={charName}
                                >
                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest">
                                        <Image
                                            src={getCharacterIconUrl(getCharIconId(charId))}
                                            alt={charName}
                                            width={40}
                                            height={40}
                                            className="w-full h-full object-cover"
                                            unoptimized
                                        />
                                    </div>
                                    {badgeIcon && (
                                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-surface-container-lowest shadow-elev-1 flex items-center justify-center">
                                            <Image
                                                src={`/data/icon/${badgeIcon}`}
                                                alt=""
                                                width={12}
                                                height={12}
                                                className="object-contain"
                                                unoptimized
                                            />
                                        </div>
                                    )}
                                </button>
                            );
                        })}

                        {characterExtraButtons}

                        {/* ALL Button - placed at the end */}
                        <button
                            key="all"
                            onClick={handleAllClick}
                            type="button"
                            aria-pressed={allSelected}
                            className={cn(
                                "state-layer focus-ring flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border type-label-l transition-colors duration-150 ease-md3-standard",
                                allSelected
                                    ? "border-transparent bg-primary-container text-on-primary-container"
                                    : "border-transparent bg-surface-container-high text-on-surface",
                            )}
                            title={t("common.filter.all")}
                        >
                            ALL
                        </button>
                    </div>
                    {extraContent}
                </FilterSection>
            )}
        </>
    );
}
