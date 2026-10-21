"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/components/md3";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import { UNIT_DATA, UNIT_DATA_LABEL_KEYS, UNIT_FIELD_LABEL_KEYS, UNIT_FIELD_TO_ID, UNIT_ICON_FILES } from "@/types/types";

interface CharacterPickerProps {
    /** Characters that have a role in the output. */
    available: ReadonlySet<number>;
    selected: number;
    onSelect: (characterId: number) => void;
    /** The selected character's units (several for the virtual singers), in display order. */
    units: string[];
    unit: string;
    onUnit: (unit: string) => void;
}

const unitOf = (characterId: number) => UNIT_DATA.find(unit => unit.charIds.includes(characterId));

/**
 * Who wears the costume, in two steps as the site's character filter has them: a unit by its
 * icon, then one of its characters by face and name. A virtual singer also picks which unit's
 * version of them (their model and motions differ by unit).
 */
export function CharacterPicker({ available, selected, onSelect, units, unit, onUnit }: CharacterPickerProps) {
    const { t } = useI18n();
    const groups = UNIT_DATA
        .map(group => ({ ...group, charIds: group.charIds.filter(id => available.has(id)) }))
        .filter(group => group.charIds.length > 0);
    // The unit being browsed: the selected character's, until another unit's icon is picked.
    const [browsing, setBrowsing] = useState<{ for: number; unit: string } | null>(null);
    const shown = groups.find(group => group.id === (browsing?.for === selected ? browsing.unit : unitOf(selected)?.id)) ?? groups[0];

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5" role="tablist" aria-label={t("page.costume3d.unit")}>
                {groups.map(group => {
                    const isShown = group.id === shown?.id;
                    const holdsSelected = group.charIds.includes(selected);
                    return (
                        <button
                            key={group.id}
                            type="button"
                            role="tab"
                            aria-selected={isShown}
                            aria-label={t(UNIT_DATA_LABEL_KEYS[group.id])}
                            title={t(UNIT_DATA_LABEL_KEYS[group.id])}
                            onClick={() => setBrowsing({ for: selected, unit: group.id })}
                            className={cn(
                                "state-layer focus-ring relative grid h-11 flex-1 place-items-center rounded-md3-md transition-colors",
                                isShown ? "bg-surface-container-highest" : "hover:bg-surface-container-high",
                            )}
                            style={isShown ? { boxShadow: `inset 0 -3px 0 ${group.color}` } : undefined}
                        >
                            <Image src={`/data/icon/${UNIT_ICON_FILES[group.id]}`} alt="" width={30} height={30} className={cn("h-7 w-7 object-contain transition-opacity", !isShown && "opacity-60")} unoptimized />
                            {holdsSelected && !isShown && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: group.color }} />}
                        </button>
                    );
                })}
            </div>

            {shown && (
                <div className="grid grid-cols-6 gap-1" role="group" aria-label={t(UNIT_DATA_LABEL_KEYS[shown.id])}>
                    {shown.charIds.map(characterId => {
                        const isSelected = characterId === selected;
                        const name = getCharacterName(t, characterId, "short");
                        return (
                            <button
                                key={characterId}
                                type="button"
                                onClick={() => onSelect(characterId)}
                                aria-pressed={isSelected}
                                title={getCharacterName(t, characterId)}
                                className="state-layer focus-ring group flex min-w-0 flex-col items-center gap-1 rounded-md3-md px-0.5 py-1.5"
                            >
                                <span
                                    className={cn(
                                        "relative h-12 w-12 overflow-hidden rounded-full bg-surface-container-high transition-[box-shadow,transform] duration-200",
                                        isSelected ? "scale-105" : "opacity-80 group-hover:opacity-100",
                                    )}
                                    style={isSelected ? { boxShadow: `0 0 0 2.5px var(--md-sys-color-surface-container-low), 0 0 0 5px ${shown.color}` } : undefined}
                                >
                                    <Image src={getCharacterIconUrl(characterId)} alt="" width={48} height={48} className="h-full w-full object-cover" unoptimized />
                                </span>
                                <span className={cn("max-w-full truncate type-label-s", isSelected ? "font-bold text-on-surface" : "text-on-surface-variant")}>{name}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {units.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("page.costume3d.version")}>
                    <span className="mr-1 type-label-m text-on-surface-variant">{t("page.costume3d.version")}</span>
                    {units.map(entry => {
                        const isSelected = entry === unit;
                        return (
                            <button
                                key={entry}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => onUnit(entry)}
                                aria-label={t(UNIT_FIELD_LABEL_KEYS[entry] ?? entry)}
                                title={t(UNIT_FIELD_LABEL_KEYS[entry] ?? entry)}
                                className={cn(
                                    "state-layer focus-ring grid h-8 w-10 place-items-center rounded-full transition-colors",
                                    isSelected ? "bg-secondary-container text-on-secondary-container" : "border border-outline-variant text-on-surface-variant",
                                )}
                            >
                                <Image src={`/data/icon/${UNIT_ICON_FILES[UNIT_FIELD_TO_ID[entry]]}`} alt="" width={22} height={22} className="h-5.5 w-5.5 object-contain" unoptimized />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
