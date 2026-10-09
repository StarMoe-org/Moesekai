"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { fetchMasterDataForServer } from "@/lib/fetch";
import { buildSongLibrary, type SongLibrary } from "@/lib/guess-music/library";
import type { ServerScope } from "@/lib/guess-music/settings";
import { fetchMusicAliases } from "@/lib/musicAliases";
import { loadTranslations } from "@/lib/translations";
import type { IMusicInfo, IMusicVocalInfo } from "@/types/music";

export interface SongLibraryState {
    library: SongLibrary | null;
    loading: boolean;
    failed: boolean;
    reload: () => void;
}

/** Loads the song pool of a server with titles in the UI language and community aliases. */
export function useSongLibrary(server: ServerScope): SongLibraryState {
    const { locale } = useI18n();
    const [library, setLibrary] = useState<SongLibrary | null>(null);
    // Keyed by the server so a failure on one server does not stick to the other.
    const [failedKey, setFailedKey] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const failed = failedKey === `${server}:${attempt}`;
    const loading = !failed && (library === null || library.server !== server);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchMasterDataForServer<IMusicInfo[]>(server, "musics.json"),
            fetchMasterDataForServer<IMusicVocalInfo[]>(server, "musicVocals.json"),
            loadTranslations(locale).catch(() => null),
            fetchMusicAliases().catch(() => new Map<number, string[]>()),
        ]).then(
            ([musics, vocals, translations, aliases]) => {
                if (cancelled) return;
                setLibrary(buildSongLibrary({ server, musics, vocals, translations, aliases }));
            },
            (error) => {
                if (cancelled) return;
                console.error("[guess-music] failed to load songs", error);
                setFailedKey(`${server}:${attempt}`);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [server, locale, attempt]);

    const reload = useCallback(() => setAttempt((value) => value + 1), []);

    return { library: library?.server === server ? library : null, loading, failed, reload };
}
