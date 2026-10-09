"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { loadTranslations, type TranslationData } from "@/lib/translations";
import { fetchMusicAliases } from "@/lib/musicAliases";
import { buildSongIndex, type SongIndex, type SongSearchEntry } from "@/lib/guess-music/answer";
import type { IMusicInfo } from "@/types/music";

/**
 * The answer catalog of the daily challenge: every released JP song with its
 * localized title and community aliases, indexed for suggestions.
 */
export interface DailySongData {
    index: SongIndex;
    musics: Map<number, IMusicInfo>;
    localizedTitle: (title: string) => string;
    localizedCaption: (caption: string) => string;
}

export function useDailySongData(): { data: DailySongData | null; error: boolean; retry: () => void } {
    const { locale } = useI18n();
    const [data, setData] = useState<DailySongData | null>(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchMasterDataForServer<IMusicInfo[]>("jp", "musics.json"),
            loadTranslations(locale).catch(() => null as TranslationData | null),
            fetchMusicAliases().catch(() => new Map<number, string[]>()),
        ])
            .then(([musics, translations, aliases]) => {
                if (cancelled) return;
                const now = Date.now();
                const titles = translations?.music?.title ?? {};
                const captions = translations?.music?.vocalCaption ?? {};
                const released = musics.filter((music) => music && music.id > 0 && music.title && music.publishedAt <= now);
                const entries: SongSearchEntry[] = released.map((music) => ({
                    id: music.id,
                    title: music.title,
                    pronunciation: music.pronunciation,
                    localizedTitle: titles[music.title] || undefined,
                    aliases: aliases.get(music.id),
                }));
                setData({
                    index: buildSongIndex(entries),
                    // Every song, released or not: a reveal always finds its jacket.
                    musics: new Map(musics.map((music) => [music.id, music])),
                    localizedTitle: (title) => titles[title] ?? "",
                    localizedCaption: (caption) => captions[caption] ?? caption,
                });
                setError(false);
            })
            .catch(() => {
                if (!cancelled) setError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [locale, attempt]);

    const retry = useCallback(() => {
        setError(false);
        setAttempt((n) => n + 1);
    }, []);

    return { data, error, retry };
}
