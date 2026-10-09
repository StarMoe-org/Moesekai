"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { TextField, cn } from "@/components/md3";
import { mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { getMusicJacketUrl } from "@/lib/assets";
import { searchSongs } from "@/lib/guess-music/answer";
import type { DailySongData } from "./DailySongData";

interface DailyAnswerInputProps {
    songs: DailySongData;
    /** Songs already guessed wrong this round: not suggested again. */
    excludeIds: readonly number[];
    disabled?: boolean;
    onPick: (musicId: number) => void;
    /** Changes whenever the field should clear (a new round or a wrong guess). */
    resetKey: string;
}

const LIMIT = 8;

/** Suggest-mode answer field: type a title, reading or alias; picking a suggestion submits it. */
export default function DailyAnswerInput({ songs, excludeIds, disabled, onPick, resetKey }: DailyAnswerInputProps) {
    const { t } = useI18n();
    const listId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (prevResetKey !== resetKey) {
        setPrevResetKey(resetKey);
        setQuery("");
        setActive(0);
    }

    useEffect(() => {
        if (!disabled) inputRef.current?.focus({ preventScroll: true });
    }, [resetKey, disabled]);

    const suggestions = useMemo(() => {
        if (!query.trim()) return [];
        const excluded = new Set(excludeIds);
        return searchSongs(songs.index, query, LIMIT + excluded.size)
            .filter((hit) => !excluded.has(hit.id))
            .slice(0, LIMIT);
    }, [songs.index, query, excludeIds]);

    const activeIndex = suggestions.length ? Math.min(active, suggestions.length - 1) : -1;
    const open = suggestions.length > 0 && !disabled;
    const optionId = (index: number) => `${listId}-opt-${index}`;

    const pick = (id: number) => {
        if (disabled) return;
        onPick(id);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!suggestions.length) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((activeIndex + 1) % suggestions.length);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((activeIndex - 1 + suggestions.length) % suggestions.length);
        } else if (event.key === "Enter") {
            event.preventDefault();
            const hit = suggestions[activeIndex >= 0 ? activeIndex : 0];
            if (hit) pick(hit.id);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <TextField
                ref={inputRef}
                icon={mdSearch}
                label={t("page.guessMusicDaily.round.inputLabel")}
                placeholder={t("page.guessMusicDaily.round.inputPlaceholder")}
                value={query}
                onValueChange={(value) => {
                    setQuery(value);
                    setActive(0);
                }}
                onKeyDown={onKeyDown}
                clearable
                disabled={disabled}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            />
            <ul id={listId} role="listbox" aria-label={t("page.guessMusicDaily.round.suggestions")} className={cn("flex flex-col gap-1", !open && "hidden")}>
                {suggestions.map((hit, index) => {
                    const song = songs.index.byId.get(hit.id)?.entry;
                    const music = songs.musics.get(hit.id);
                    if (!song) return null;
                    const secondary = hit.kind === "alias" ? hit.text : song.localizedTitle && song.localizedTitle !== song.title ? song.localizedTitle : "";
                    return (
                        <li
                            key={hit.id}
                            id={optionId(index)}
                            role="option"
                            aria-selected={index === activeIndex}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => pick(hit.id)}
                            className={cn(
                                "state-layer flex cursor-pointer items-center gap-3 rounded-md3-md px-3 py-2 transition-colors",
                                index === activeIndex ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container text-on-surface",
                            )}
                        >
                            {music?.assetbundleName ? (
                                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md3-sm bg-surface-container-highest">
                                    <Image src={getMusicJacketUrl(music.assetbundleName, "main-jp")} alt="" fill sizes="40px" className="object-cover" unoptimized />
                                </span>
                            ) : null}
                            <span className="min-w-0 flex-1">
                                <span className="block truncate type-body-l">{song.title}</span>
                                {secondary ? (
                                    <span className={cn("block truncate type-body-s", index === activeIndex ? "text-on-secondary-container" : "text-on-surface-variant")}>
                                        {hit.kind === "alias" ? t("page.guessMusicDaily.round.aliasMatch", { alias: secondary }) : secondary}
                                    </span>
                                ) : null}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {query.trim() && !suggestions.length && !disabled ? (
                <p className="px-1 type-body-m text-on-surface-variant">{t("page.guessMusicDaily.round.noMatch")}</p>
            ) : null}
        </div>
    );
}
