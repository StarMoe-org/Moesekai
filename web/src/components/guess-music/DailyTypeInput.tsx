"use client";

import { useEffect, useRef, useState } from "react";
import { Button, TextField, cn } from "@/components/md3";
import { mdCheck } from "@/components/md3/icons";
import { useI18n } from "@/contexts/I18nContext";
import { resolveTypedAnswer } from "@/lib/guess-music/daily-api";
import type { DailySongData } from "./DailySongData";

interface DailyTypeInputProps {
    songs: DailySongData;
    /** Songs already guessed wrong this round. */
    wrongIds: readonly number[];
    disabled?: boolean;
    onPick: (musicId: number) => void;
    /** Changes whenever the field should clear (a new round or a wrong guess). */
    resetKey: string;
}

type Hint = { kind: "none" | "ambiguous" | "repeat"; text: string } | null;

/**
 * Hard and hell tiers: no suggestions. The typed text is resolved to a song
 * here; text that names no song (or several) is pointed out and costs nothing,
 * only a real song goes to the server as a guess.
 */
export default function DailyTypeInput({ songs, wrongIds, disabled, onPick, resetKey }: DailyTypeInputProps) {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState("");
    const [hint, setHint] = useState<Hint>(null);
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (prevResetKey !== resetKey) {
        setPrevResetKey(resetKey);
        setText("");
        setHint(null);
    }

    useEffect(() => {
        if (!disabled) inputRef.current?.focus({ preventScroll: true });
    }, [resetKey, disabled]);

    const submit = () => {
        if (disabled) return;
        const typed = text.trim();
        const resolved = resolveTypedAnswer(songs.index, typed);
        if (resolved.status === "empty") return;
        if (resolved.status === "none") {
            setHint({ kind: "none", text: typed });
            return;
        }
        if (resolved.status === "ambiguous") {
            setHint({ kind: "ambiguous", text: typed });
            return;
        }
        if (wrongIds.includes(resolved.musicId)) {
            setHint({ kind: "repeat", text: typed });
            return;
        }
        setHint(null);
        onPick(resolved.musicId);
    };

    return (
        <div className="flex flex-col gap-2">
            <form
                className="flex items-start gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                <TextField
                    ref={inputRef}
                    value={text}
                    onValueChange={(value) => {
                        setText(value);
                        setHint(null);
                    }}
                    disabled={disabled}
                    label={t("page.guessMusicDaily.round.typeLabel")}
                    placeholder={t("page.guessMusicDaily.round.typePlaceholder")}
                    containerClassName="min-w-0 flex-1"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="send"
                    aria-describedby="daily-type-hint"
                />
                <Button type="submit" variant="filled" icon={mdCheck} disabled={disabled || !text.trim()}>
                    {t("page.guessMusicDaily.round.submit")}
                </Button>
            </form>
            <p id="daily-type-hint" className={cn("px-1 type-body-s", hint ? "text-error" : "text-on-surface-variant")} aria-live="polite">
                {hint?.kind === "none"
                    ? t("page.guessMusicDaily.round.typeNoSong", { text: hint.text })
                    : hint?.kind === "ambiguous"
                      ? t("page.guessMusicDaily.round.typeAmbiguous", { text: hint.text })
                      : hint?.kind === "repeat"
                        ? t("page.guessMusicDaily.round.alreadyGuessed")
                        : t("page.guessMusicDaily.round.typeHint")}
            </p>
        </div>
    );
}
