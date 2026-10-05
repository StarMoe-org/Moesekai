import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { UNIT_DATA, UNIT_ICON_FILES, UNIT_ID_LABEL_KEYS } from "@/types/types";
import { getCharacterIconUrl } from "@/lib/assets";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterName } from "@/lib/i18n";

interface CharacterSelectorProps {
    selectedCharacterId: number | null;
    onSelect: (id: number) => void;
    availableCharacterIds?: readonly number[];
    hideUnitFilter?: boolean;
}

export default function CharacterSelector({
    selectedCharacterId,
    onSelect,
    availableCharacterIds,
    hideUnitFilter = false,
}: CharacterSelectorProps) {
    const { t } = useI18n();
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

    const availableCharacterIdSet = useMemo(
        () => availableCharacterIds ? new Set(availableCharacterIds) : null,
        [availableCharacterIds],
    );

    const visibleUnits = useMemo(() => {
        if (availableCharacterIdSet === null) return UNIT_DATA;
        return UNIT_DATA.filter(unit => unit.charIds.some(charId => availableCharacterIdSet.has(charId)));
    }, [availableCharacterIdSet]);

    useEffect(() => {
        if (selectedUnitId === null) return;
        if (visibleUnits.some(unit => unit.id === selectedUnitId)) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedUnitId(null);
    }, [selectedUnitId, visibleUnits]);

    const handleUnitClick = (unitId: string) => {
        if (selectedUnitId === unitId) {
            setSelectedUnitId(null);
        } else {
            setSelectedUnitId(unitId);
        }
    };

    const displayedCharacters = useMemo(() => {
        if (!selectedUnitId) {
            return availableCharacterIds ?? UNIT_DATA.flatMap(u => u.charIds);
        }
        const unit = visibleUnits.find(u => u.id === selectedUnitId);
        if (!unit) return [];
        return availableCharacterIdSet
            ? unit.charIds.filter(charId => availableCharacterIdSet.has(charId))
            : unit.charIds;
    }, [selectedUnitId, availableCharacterIdSet, availableCharacterIds, visibleUnits]);


    return (
        <div className="space-y-4">
            {/* Unit Filter */}
            {!hideUnitFilter && <div className="flex flex-wrap gap-2">
                {visibleUnits.map(unit => {
                    const iconName = UNIT_ICON_FILES[unit.id] || "";
                    const isSelected = selectedUnitId === unit.id;
                    const unitLabel = t(UNIT_ID_LABEL_KEYS[unit.id] ?? `common.units.${unit.id}`);
                    return (
                        <button
                            key={unit.id}
                            onClick={() => handleUnitClick(unit.id)}
                            className={`state-layer focus-ring p-1.5 rounded-md3-md transition-colors ${isSelected
                                ? "ring-2 ring-primary bg-secondary-container"
                                : "border border-transparent bg-surface-container"
                                }`}
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
            </div>}

            {/* Character Grid */}
            <div className="flex flex-wrap gap-2">
                {displayedCharacters.map(charId => {
                    const characterName = getCharacterName(t, charId);
                    return (
                        <button
                            key={charId}
                            onClick={() => onSelect(charId)}
                            className={`focus-ring relative transition-[opacity,box-shadow] ${selectedCharacterId === charId
                                ? "ring-2 ring-primary z-10 rounded-full"
                                : "ring-2 ring-transparent hover:ring-outline-variant rounded-full opacity-80 hover:opacity-100"
                                }`}
                            title={characterName}
                        >
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-high">
                                <Image
                                    src={getCharacterIconUrl(charId)}
                                    alt={characterName}
                                    width={40}
                                    height={40}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                />
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
