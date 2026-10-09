"use client";
import React, { useMemo, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import CollapsibleBlock from "./CollapsibleBlock";
import { Button, Icon } from "@/components/md3";
import { mdKeyboardArrowDown } from "@/components/md3/icons";
import { difficultyFillStyle } from "@/types/music";

export interface SongGainView {
    key: string;
    title: string;
    /** Translated title, shown under the original when present. */
    subtitle?: string;
    difficulty: string;
    ptPerPlay: number;
    ptPerHour: number;
    /** null at 0 fire (no stamina spent). */
    ptPerStamina: number | null;
}

type SortKey = "ptPerPlay" | "ptPerHour" | "ptPerStamina";

interface SongGainTableProps {
    rows: SongGainView[];
    selectedKey: string | null;
    onUse(key: string): void;
    /** Rows shown besides the pinned current song; default 10. */
    limit?: number;
}


/** Splits off the last word (a trailing Latin/digit run, else the last character) so the sort arrow can stay on its line. */
function splitLastWord(label: string): [string, string] {
    const i = label.search(/(?:[A-Za-z0-9]+|\S)$/);
    return i > 0 ? [label.slice(0, i), label.slice(i)] : ["", label];
}

function sortValue(row: SongGainView, key: SortKey): number {
    const v = row[key];
    return v === null ? -Infinity : v;
}

/** Per-song PT for the chosen deck: PT per play, per hour and per stamina, with a switch-song action. */
export default function SongGainTable({ rows, selectedKey, onUse, limit = 10 }: SongGainTableProps) {
    const { t, formatNumber } = useI18n();
    const [sortKey, setSortKey] = useState<SortKey>("ptPerHour");

    const visible = useMemo(() => {
        const sorted = [...rows].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));
        const top = sorted.slice(0, limit);
        if (selectedKey && !top.some((r) => r.key === selectedKey)) {
            const current = rows.find((r) => r.key === selectedKey);
            if (current) top.push(current);
        }
        return top;
    }, [rows, sortKey, limit, selectedKey]);

    if (rows.length === 0) return null;

    // h-px on the cell lets the button's h-full resolve to the row height, so the whole cell is the tap target.
    // On phones the button is two label lines tall, so a label that wraps once the arrow is added keeps the row height.
    const header = (key: SortKey, label: string, width: string, last = false) => {
        const sorted = sortKey === key;
        const [head, tail] = splitLastWord(label);
        return (
            <th className={`${width} h-px p-0 text-right align-bottom type-label-m`} aria-sort={sorted ? "descending" : "none"}>
                <button
                    type="button"
                    onClick={() => setSortKey(key)}
                    aria-pressed={sorted}
                    className={`state-layer focus-ring relative flex h-full min-h-10 sm:min-h-0 w-full items-end justify-end rounded-md3-xs py-1.5 pl-1 ${last ? "pr-2" : ""} text-right type-label-m leading-tight whitespace-normal ${sorted ? "text-primary type-emphasized" : "text-on-surface-variant"}`}
                >
                    {sorted ? (
                        // The arrow flows inline after the label, kept on one line with the last word.
                        <span>
                            {head}
                            <span className="whitespace-nowrap">
                                {tail}
                                <Icon path={mdKeyboardArrowDown} size={14} className="inline-block ml-0.5 align-[-2px]" />
                            </span>
                        </span>
                    ) : (
                        <span>{label}</span>
                    )}
                </button>
            </th>
        );
    };

    return (
        <CollapsibleBlock title={t("page.predictionPlanner.pt.songGain.title")}>
            <div className="overflow-x-auto rounded-md3-md border border-outline-variant bg-surface-container-lowest text-on-surface">
                <table className="w-full table-fixed type-body-s">
                    <thead className="bg-surface-container-high">
                        <tr>
                            <th className="py-1.5 px-2 text-left align-bottom type-label-m text-on-surface-variant">
                                {t("page.predictionPlanner.pt.songGain.columns.song")}
                            </th>
                            {header("ptPerPlay", t("page.predictionPlanner.pt.songGain.columns.ptPerPlay"), "w-[3.6rem] sm:w-24")}
                            {header("ptPerHour", t("page.predictionPlanner.pt.songGain.columns.ptPerHour"), "w-[4.1rem] sm:w-28")}
                            {/* Wide enough for the bold en "stamina" plus the arrow on one line. */}
                            {header("ptPerStamina", t("page.predictionPlanner.pt.songGain.columns.ptPerStamina"), "w-[4.5rem] sm:w-28", true)}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((row) => {
                            const selected = row.key === selectedKey;
                            return (
                                <tr
                                    key={row.key}
                                    className={`border-t border-outline-variant ${selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface"}`}
                                >
                                    <td className="py-1.5 px-2 align-top min-w-0">
                                        <div className="truncate type-label-l" title={row.title}>
                                            {row.title}
                                        </div>
                                        {row.subtitle && (
                                            <div className={`truncate type-body-s ${selected ? "text-on-secondary-container" : "text-on-surface-variant"}`} title={row.subtitle}>{row.subtitle}</div>
                                        )}
                                        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                            <span className="px-1.5 py-0.5 rounded-md3-xs type-label-s uppercase bg-surface-container-high text-on-surface" style={difficultyFillStyle(row.difficulty)}>
                                                {row.difficulty}
                                            </span>
                                            {!selected && (
                                                <Button variant="text" size="xs" onClick={() => onUse(row.key)}>
                                                    {t("page.predictionPlanner.pt.songGain.use")}
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-1.5 pl-1 text-right align-top font-mono tabular-nums">
                                        {formatNumber(Math.round(row.ptPerPlay))}
                                    </td>
                                    <td className="py-1.5 pl-1 text-right align-top type-label-l font-mono tabular-nums">
                                        {formatNumber(Math.round(row.ptPerHour))}
                                    </td>
                                    <td className="py-1.5 pl-1 pr-2 text-right align-top font-mono tabular-nums">
                                        {row.ptPerStamina === null ? "-" : formatNumber(Math.round(row.ptPerStamina))}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </CollapsibleBlock>
    );
}
