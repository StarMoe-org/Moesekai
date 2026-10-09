"use client";

import { useEffect, useRef } from "react";
import { Icon, cn } from "@/components/md3";
import { mdClose } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import type { DailySongData } from "./DailySongData";

interface DailyChoiceGridProps {
    songs: DailySongData;
    /** Music ids from the server, in display order. */
    options: readonly number[];
    /** Options already guessed wrong this round. */
    wrongIds: readonly number[];
    disabled?: boolean;
    onPick: (musicId: number) => void;
}

/** Easy tier: pick one of the server's options; number keys 1-9 work too. */
export default function DailyChoiceGrid({ songs, options, wrongIds, disabled, onPick }: DailyChoiceGridProps) {
    const { t } = useI18n();
    const wrong = new Set(wrongIds);
    const pickRef = useRef<(index: number) => void>(() => {});
    useEffect(() => {
        pickRef.current = (index: number) => {
            const id = options[index];
            if (id === undefined || disabled || wrongIds.includes(id)) return;
            onPick(id);
        };
    });

    // The reveal's "next" button is gone once a round opens, and a wrong option turns disabled under the
    // focus: put focus back on the options (like the answer fields of the other tiers).
    const gridRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const grid = gridRef.current;
        if (disabled || !grid) return;
        const focused = document.activeElement;
        const lost = !focused || focused === document.body || (grid.contains(focused) && (focused as HTMLButtonElement).disabled);
        if (lost) grid.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    }, [disabled]);

    useEffect(() => {
        if (disabled) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
            const target = event.target as HTMLElement | null;
            if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
            if (!/^[1-9]$/.test(event.key)) return;
            event.preventDefault();
            pickRef.current(Number(event.key) - 1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [disabled]);

    return (
        <div ref={gridRef} className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label={t("page.guessMusicDaily.round.choiceLabel")}>
            {options.map((id, index) => {
                const music = songs.musics.get(id);
                const title = music?.title ?? `#${id}`;
                const localized = music ? songs.localizedTitle(music.title) : "";
                const isWrong = wrong.has(id);
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => pickRef.current(index)}
                        disabled={disabled || isWrong}
                        className={cn(
                            "state-layer focus-ring flex min-h-14 items-center gap-3 rounded-md3-md border px-3 py-2 text-left transition-colors",
                            isWrong ? "border-transparent bg-error-container text-on-error-container" : "border-outline-variant bg-surface-container-lowest text-on-surface",
                            disabled && !isWrong && "cursor-not-allowed opacity-60",
                        )}
                    >
                        <span
                            aria-hidden="true"
                            className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full type-label-l tabular-nums",
                                isWrong ? "bg-error text-on-error" : "bg-secondary-container text-on-secondary-container",
                            )}
                        >
                            {isWrong ? <Icon path={mdClose} size={18} /> : index + 1}
                        </span>
                        <span className="block min-w-0 flex-1">
                            <span className="block truncate type-body-l">{title}</span>
                            {localized && localized !== title ? (
                                <span className={cn("block truncate type-body-s", isWrong ? "text-on-error-container" : "text-on-surface-variant")}>{localized}</span>
                            ) : null}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
