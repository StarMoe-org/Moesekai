"use client";

import Image from "next/image";
import { cn } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import { UNIT_DATA, UNIT_DATA_LABEL_KEYS } from "@/types/types";

interface CharacterPickerProps {
    /** Characters that have a role in the output. */
    available: ReadonlySet<number>;
    selected: number | null;
    onSelect: (characterId: number) => void;
    /** One scrolling row instead of a row per unit (narrow screens). */
    compact?: boolean;
}

/** The characters by unit, as icons; each unit's row is marked with its colour. */
export function CharacterPicker({ available, selected, onSelect, compact = false }: CharacterPickerProps) {
    const { t } = useI18n();
    const units = UNIT_DATA
        .map(unit => ({ ...unit, charIds: unit.charIds.filter(id => available.has(id)) }))
        .filter(unit => unit.charIds.length > 0);

    const button = (characterId: number) => {
        const name = getCharacterName(t, characterId);
        const isSelected = selected === characterId;
        return (
            <button
                key={characterId}
                type="button"
                onClick={() => onSelect(characterId)}
                aria-pressed={isSelected}
                aria-label={name}
                title={name}
                className={cn(
                    "state-layer focus-ring relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-container-high transition-shadow",
                    isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-low" : "opacity-80 hover:opacity-100",
                )}
            >
                <Image src={getCharacterIconUrl(characterId)} alt="" width={40} height={40} className="h-full w-full object-cover" unoptimized />
            </button>
        );
    };

    if (compact) {
        return (
            <div className="flex gap-2 overflow-x-auto px-1 py-2" role="group" aria-label={t("page.costume3d.characters")}>
                {units.flatMap(unit => unit.charIds.map(button))}
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2" role="group" aria-label={t("page.costume3d.characters")}>
            {units.map(unit => (
                <div
                    key={unit.id}
                    className="flex flex-wrap gap-2 border-l-4 py-1 pl-3"
                    style={{ borderColor: unit.color }}
                    title={t(UNIT_DATA_LABEL_KEYS[unit.id])}
                >
                    {unit.charIds.map(button)}
                </div>
            ))}
        </div>
    );
}
