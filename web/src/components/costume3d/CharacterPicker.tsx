"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
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
}

/**
 * Every character in one row of icons, by unit, each unit underlined in its colour. A row too
 * long for the page scrolls sideways and keeps the selected character in view.
 */
export function CharacterPicker({ available, selected, onSelect }: CharacterPickerProps) {
    const { t } = useI18n();
    const selectedRef = useRef<HTMLButtonElement>(null);
    const units = UNIT_DATA
        .map(unit => ({ ...unit, charIds: unit.charIds.filter(id => available.has(id)) }))
        .filter(unit => unit.charIds.length > 0);

    useEffect(() => {
        selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [selected]);

    return (
        <div className="flex gap-2.5 overflow-x-auto px-1 pb-1 pt-1.5" role="group" aria-label={t("page.costume3d.characters")}>
            {units.map(unit => (
                <div
                    key={unit.id}
                    className="flex shrink-0 gap-1 border-b-[3px] pb-1.5"
                    style={{ borderColor: unit.color }}
                    title={t(UNIT_DATA_LABEL_KEYS[unit.id])}
                >
                    {unit.charIds.map(characterId => {
                        const name = getCharacterName(t, characterId);
                        const isSelected = selected === characterId;
                        return (
                            <button
                                key={characterId}
                                ref={isSelected ? selectedRef : undefined}
                                type="button"
                                onClick={() => onSelect(characterId)}
                                aria-pressed={isSelected}
                                aria-label={name}
                                title={name}
                                className={cn(
                                    "state-layer focus-ring relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-container-high transition-[opacity,box-shadow]",
                                    isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : "opacity-75 hover:opacity-100",
                                )}
                            >
                                <Image src={getCharacterIconUrl(characterId)} alt="" width={36} height={36} className="h-full w-full object-cover" unoptimized />
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
