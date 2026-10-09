"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useI18n } from "@/contexts/I18nContext";
import { getCharacterIconUrl } from "@/lib/assets";
import { getCharacterName } from "@/lib/i18n";
import { UNIT_DATA, UNIT_DATA_LABEL_KEYS, UNIT_ICON_FILES } from "@/types/types";
import { cn } from "@/components/md3";

interface Props {
    values: Map<number, number>;
    /** Draws a unit-coloured bar under each value, scaled to the largest one. */
    showBar?: boolean;
    /** Optional second line under the value, e.g. a high score. */
    renderDetail?: (characterId: number) => ReactNode;
}

const COLUMNS = 4;
const ROW_GRID = "grid grid-cols-[1.5rem_repeat(4,minmax(0,1fr))] items-center gap-x-2 sm:grid-cols-[1.75rem_repeat(4,minmax(0,1fr))] sm:gap-x-3";

/**
 * All 26 characters as the game lists them: one row per unit (Virtual Singers
 * wrap onto a second row), each with the character icon and a large number.
 */
export default function CharacterStatGrid({ values, showBar = false, renderDetail }: Props) {
    const { t, formatNumber } = useI18n();
    const max = Math.max(1, ...values.values());

    return (
        <div className="divide-y divide-outline-variant/60">
            {UNIT_DATA.map((unit) => {
                const rows: number[][] = [];
                for (let i = 0; i < unit.charIds.length; i += COLUMNS) rows.push(unit.charIds.slice(i, i + COLUMNS));
                const unitLabel = t(UNIT_DATA_LABEL_KEYS[unit.id]);

                return (
                    <div key={unit.id} className="space-y-1 py-2 first:pt-0 last:pb-0">
                        {rows.map((ids, rowIndex) => (
                            <div key={rowIndex} className={ROW_GRID}>
                                {rowIndex === 0 ? (
                                    <img
                                        src={`/data/icon/${UNIT_ICON_FILES[unit.id]}`}
                                        alt={unitLabel}
                                        title={unitLabel}
                                        className="size-6 object-contain sm:size-7"
                                        loading="lazy"
                                    />
                                ) : <span aria-hidden="true" />}
                                {ids.map((id) => {
                                    const value = values.get(id) ?? 0;
                                    const name = getCharacterName(t, id, "short");
                                    const detail = renderDetail?.(id);
                                    return (
                                        <div key={id} className="flex min-w-0 items-center gap-1.5 py-1 sm:gap-2" title={name}>
                                            <Image
                                                src={getCharacterIconUrl(id)}
                                                alt={name}
                                                width={36}
                                                height={36}
                                                className="size-7 shrink-0 rounded-full bg-surface-container-high sm:size-9"
                                                unoptimized
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className={cn(
                                                    "type-title-m tabular-nums leading-none",
                                                    value > 0 ? "text-on-surface" : "text-on-surface-variant",
                                                )}>
                                                    {value > 0 ? formatNumber(value) : "–"}
                                                </div>
                                                {showBar && (
                                                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-container-highest">
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{ width: `${(value / max) * 100}%`, backgroundColor: unit.color }}
                                                        />
                                                    </div>
                                                )}
                                                {detail != null && (
                                                    <div className="mt-1 truncate type-label-s tabular-nums text-on-surface-variant">{detail}</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}
