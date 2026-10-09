"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Icon, TextField, cn } from "@/components/md3";
import { mdCheck, mdClose, mdFlag, mdSearch } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { isSameSong, matchesTypedAnswer, normalizeAnswer, searchSongs, type SongSuggestion } from "@/lib/guess-music/answer";
import type { Guess } from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/library";
import type { AnswerMode } from "@/lib/guess-music/scoring";

export interface AnswerPanelProps {
    mode: AnswerMode;
    library: SongLibrary;
    answerId: number;
    /** Choice mode options, in display order. */
    optionIds: readonly number[];
    wrongGuesses: readonly Guess[];
    /** The clip has started and the round is still open. */
    enabled: boolean;
    /** Giving up also works before the clip plays (say, when the audio will not start). */
    canGiveUp: boolean;
    onGuess: (guess: Guess, correct: boolean) => void;
    onGiveUp: () => void;
    className?: string;
}

const SUGGESTION_LIMIT = 8;

export function songGuess(library: SongLibrary, musicId: number): Guess {
    return { key: `id:${musicId}`, label: library.musicById.get(musicId)?.title ?? `#${musicId}`, musicId };
}

function SongTitles({ library, musicId, className }: { library: SongLibrary; musicId: number; className?: string }) {
    const entry = library.entryById.get(musicId);
    return (
        <span className={cn("block min-w-0", className)}>
            <span className="block truncate type-body-l text-on-surface">{entry?.title ?? `#${musicId}`}</span>
            {entry?.localizedTitle && <span className="block truncate type-body-s text-on-surface-variant">{entry.localizedTitle}</span>}
        </span>
    );
}

function WrongGuessList({ guesses }: { guesses: readonly Guess[] }) {
    const { t } = useI18n();
    if (!guesses.length) return null;
    return (
        <div className="space-y-2">
            <div className="type-label-l text-on-surface-variant">{t("page.guessMusic.answer.wrongGuesses")}</div>
            <ul className="flex flex-wrap gap-2">
                {guesses.map((guess) => (
                    <li key={guess.key} className="inline-flex h-8 max-w-full items-center gap-1 rounded-md3-sm bg-error-container px-3 type-label-l text-on-error-container">
                        <Icon path={mdClose} size={16} />
                        <span className="truncate">{guess.label}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ChoiceGrid({ library, answerId, optionIds, wrongGuesses, enabled, onGuess }: AnswerPanelProps) {
    const wrongIds = useMemo(() => new Set(wrongGuesses.map((guess) => guess.musicId)), [wrongGuesses]);
    const choose = (musicId: number) => {
        if (!enabled || wrongIds.has(musicId)) return;
        onGuess(songGuess(library, musicId), isSameSong(library.index, musicId, answerId));
    };
    const chooseRef = useRef(choose);
    useEffect(() => {
        chooseRef.current = choose;
    });

    // The reveal's "next" button is gone once a round opens, and a wrong option turns disabled under the
    // focus: put focus back on the options (like the inputs of the other modes).
    const gridRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const grid = gridRef.current;
        if (!enabled || !grid) return;
        const focused = document.activeElement;
        const lost = !focused || focused === document.body || (grid.contains(focused) && (focused as HTMLButtonElement).disabled);
        if (lost) grid.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    }, [enabled, wrongIds]);

    // Number keys pick an option (1-9, 0 for the tenth).
    useEffect(() => {
        if (!enabled) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
            const target = event.target as HTMLElement | null;
            if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
            if (!/^[0-9]$/.test(event.key)) return;
            const index = event.key === "0" ? 9 : Number(event.key) - 1;
            const id = optionIds[index];
            if (id === undefined) return;
            event.preventDefault();
            chooseRef.current(id);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [enabled, optionIds]);

    return (
        <div ref={gridRef} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {optionIds.map((id, index) => {
                const wrong = wrongIds.has(id);
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => choose(id)}
                        disabled={!enabled || wrong}
                        className={cn(
                            "state-layer focus-ring flex min-h-14 items-center gap-3 rounded-md3-md border px-3 py-2 text-left transition-colors",
                            wrong
                                ? "border-transparent bg-error-container text-on-error-container"
                                : "border-outline-variant bg-surface-container-lowest text-on-surface",
                            !enabled && !wrong && "cursor-not-allowed opacity-60",
                        )}
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full type-label-l tabular-nums",
                                wrong ? "bg-error text-on-error" : "bg-secondary-container text-on-secondary-container",
                            )}
                        >
                            {wrong ? <Icon path={mdClose} size={18} /> : (index + 1) % 10}
                        </span>
                        <SongTitles library={library} musicId={id} className="flex-1" />
                    </button>
                );
            })}
        </div>
    );
}

function SuggestBox({ library, answerId, wrongGuesses, enabled, onGuess }: AnswerPanelProps) {
    const { t } = useI18n();
    const listId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const suggestions = useMemo(() => searchSongs(library.index, query, SUGGESTION_LIMIT), [library.index, query]);
    const wrongIds = useMemo(() => new Set(wrongGuesses.map((guess) => guess.musicId)), [wrongGuesses]);
    const expanded = open && suggestions.length > 0 && enabled;

    useEffect(() => {
        if (enabled) inputRef.current?.focus({ preventScroll: true });
    }, [enabled]);

    const pick = (suggestion: SongSuggestion) => {
        if (!enabled || wrongIds.has(suggestion.id)) return;
        onGuess(songGuess(library, suggestion.id), isSameSong(library.index, suggestion.id, answerId));
        setQuery("");
        setOpen(false);
        setActive(-1);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!suggestions.length) return;
            event.preventDefault();
            setOpen(true);
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((current) => (current < 0 ? (step > 0 ? 0 : suggestions.length - 1) : (current + step + suggestions.length) % suggestions.length));
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (active >= 0 && suggestions[active]) pick(suggestions[active]);
            else if (suggestions.length) {
                setOpen(true);
                setActive(0);
            }
        } else if (event.key === "Escape" && expanded) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActive(-1);
        }
    };

    return (
        <div className="space-y-3">
            <TextField
                ref={inputRef}
                icon={mdSearch}
                value={query}
                onValueChange={(value) => {
                    setQuery(value);
                    setOpen(true);
                    setActive(-1);
                }}
                onKeyDown={onKeyDown}
                onFocus={() => setOpen(true)}
                disabled={!enabled}
                placeholder={t("page.guessMusic.answer.searchPlaceholder")}
                aria-label={t("page.guessMusic.answer.searchLabel")}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={expanded}
                aria-controls={listId}
                aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="send"
            />
            <ul
                id={listId}
                role="listbox"
                aria-label={t("page.guessMusic.answer.suggestions")}
                className={cn("overflow-hidden rounded-md3-md bg-surface-container-high", !expanded && "hidden")}
            >
                {suggestions.map((suggestion, index) => {
                    const guessed = wrongIds.has(suggestion.id);
                    const entry = library.entryById.get(suggestion.id);
                    return (
                        <li
                            key={suggestion.id}
                            id={`${listId}-${index}`}
                            role="option"
                            aria-selected={index === active}
                            aria-disabled={guessed || undefined}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseMove={() => setActive(index)}
                            onClick={() => pick(suggestion)}
                            className={cn(
                                "state-layer flex cursor-pointer items-center gap-3 px-4 py-2",
                                index === active && "bg-secondary-container text-on-secondary-container",
                                guessed && "cursor-not-allowed opacity-38",
                            )}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate type-body-l">{entry?.title ?? suggestion.text}</span>
                                {(entry?.localizedTitle || suggestion.kind === "alias") && (
                                    <span className="block truncate type-body-s text-on-surface-variant">
                                        {suggestion.kind === "alias"
                                            ? t("page.guessMusic.answer.aliasMatch", { alias: suggestion.text })
                                            : entry?.localizedTitle}
                                    </span>
                                )}
                            </span>
                            {guessed && <Icon path={mdClose} size={18} className="shrink-0 text-error" />}
                        </li>
                    );
                })}
            </ul>
            {enabled && query.trim() && !suggestions.length && (
                <p className="type-body-m text-on-surface-variant">{t("page.guessMusic.answer.noSuggestions")}</p>
            )}
            <WrongGuessList guesses={wrongGuesses} />
        </div>
    );
}

function TypeBox({ library, answerId, wrongGuesses, enabled, onGuess }: AnswerPanelProps) {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState("");

    useEffect(() => {
        if (enabled) inputRef.current?.focus({ preventScroll: true });
    }, [enabled]);

    const submit = () => {
        const key = normalizeAnswer(text);
        if (!enabled || !key) return;
        const entry = library.entryById.get(answerId);
        const correct = Boolean(entry && matchesTypedAnswer(entry, text));
        onGuess({ key: `text:${key}`, label: text.trim(), musicId: null }, correct);
        setText("");
    };

    return (
        <div className="space-y-3">
            <form
                className="flex gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                <TextField
                    ref={inputRef}
                    value={text}
                    onValueChange={setText}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            submit();
                        }
                    }}
                    disabled={!enabled}
                    placeholder={t("page.guessMusic.answer.typePlaceholder")}
                    aria-label={t("page.guessMusic.answer.typeLabel")}
                    containerClassName="min-w-0 flex-1"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="send"
                />
                <Button type="submit" variant="filled" icon={mdCheck} disabled={!enabled || !normalizeAnswer(text)}>
                    {t("page.guessMusic.answer.submit")}
                </Button>
            </form>
            <p className="type-body-s text-on-surface-variant">{t("page.guessMusic.answer.typeHint")}</p>
            <WrongGuessList guesses={wrongGuesses} />
        </div>
    );
}

/** The answer area of a round: options, a search box with suggestions, or a bare text box. */
export default function AnswerPanel(props: AnswerPanelProps) {
    const { t } = useI18n();
    return (
        <div className={cn("space-y-4 rounded-md3-xl bg-surface-container-low p-4 sm:p-5", props.className)}>
            {props.mode === "choice" ? <ChoiceGrid {...props} /> : props.mode === "suggest" ? <SuggestBox {...props} /> : <TypeBox {...props} />}
            <div className="flex justify-end">
                <Button variant="text" color="secondary" icon={mdFlag} onClick={props.onGiveUp} disabled={!props.canGiveUp}>
                    {t("page.guessMusic.answer.giveUp")}
                </Button>
            </div>
        </div>
    );
}
