"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Snackbar } from "@/components/md3";
import type { AssetSourceType } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { createGameState, gameReducer, type GameAction } from "@/lib/guess-music/game";
import { restrictPoolToVocals } from "@/lib/guess-music/pool";
import { createPracticeApi, vocalRemovalState, type CatalogState, type PracticeApi } from "@/lib/guess-music/practice-api";
import { createSeed } from "@/lib/guess-music/random";
import { buildRounds, requiredPoolSize } from "@/lib/guess-music/rounds";
import {
    SETTINGS_PARAMS,
    defaultSettings,
    detectPreset,
    hasSettingsParams,
    parseSettingsParams,
    sanitizeSeed,
    settingsToParams,
    type FreePlaySettings,
    type PresetId,
} from "@/lib/guess-music/settings";
import FreePlayGame from "./FreePlayGame";
import FreePlayResults from "./FreePlayResults";
import FreePlaySetup from "./FreePlaySetup";
import { useSongLibrary } from "./useSongLibrary";

/** URL parameters owned by the free-play tab. */
export const FREE_PLAY_PARAMS = SETTINGS_PARAMS;

export interface FreePlayPanelProps {
    /** `location.search` when the panel mounted; share links restore their settings from it. */
    initialSearch: string;
    /** The free-play tab is the visible one (only then does it write its settings to the URL). */
    active: boolean;
    /** A game is running: the page hides its tabs. */
    onPlayingChange: (playing: boolean) => void;
}

function initialState(search: string): { settings: FreePlaySettings; preset: PresetId } {
    const params = new URLSearchParams(search);
    const fallback = defaultSettings();
    const settings = hasSettingsParams(params) ? parseSettingsParams(params, fallback) : fallback;
    return { settings, preset: detectPreset(settings) };
}

function shareUrlFor(settings: FreePlaySettings): string {
    if (typeof window === "undefined") return "";
    const params = settingsToParams(settings);
    params.set("tab", "free");
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

/** Which vocals have an instrumental on the server; asked once per page. */
function useInstrumentalCatalog(api: PracticeApi): CatalogState {
    const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
    useEffect(() => {
        const controller = new AbortController();
        api.instrumentals(controller.signal).then(
            (data) => setCatalog({ status: "loaded", catalog: data }),
            (error: unknown) => {
                if (controller.signal.aborted) return;
                console.warn("[guess-music] instrumentals unavailable", error);
                setCatalog({ status: "failed" });
            },
        );
        return () => controller.abort();
    }, [api]);
    return catalog;
}

/**
 * The free-play tab: setup, the game and its results. The game runs in the
 * browser; only vocal-removal rounds ask the server for their clips.
 */
export default function FreePlayPanel({ initialSearch, active, onPlayingChange }: FreePlayPanelProps) {
    const { t } = useI18n();
    const [{ settings, preset }, setSetup] = useState(() => initialState(initialSearch));
    const practiceApi = useMemo(() => createPracticeApi(), []);
    const catalog = useInstrumentalCatalog(practiceApi);
    const vocalRemoval = vocalRemovalState(settings.server, catalog);
    // Without instrumentals the game plays what the settings would play minus vocal removal; the preset shown follows.
    const blocked = vocalRemoval === "unavailable" || vocalRemoval === "serverUnsupported";
    const effective = useMemo(() => (blocked && settings.vocalRemoval ? { ...settings, vocalRemoval: false } : settings), [blocked, settings]);
    const shownPreset: PresetId = effective === settings ? preset : detectPreset(effective);
    const [state, rawDispatch] = useReducer(gameReducer, undefined, createGameState);
    const [snackbar, setSnackbar] = useState<string | null>(null);
    const { library, loading, failed, reload } = useSongLibrary(settings.server);
    const assetSource: AssetSourceType = settings.server === "cn" ? "main-cn" : "main-jp";
    const dispatch = useCallback((action: GameAction) => rawDispatch(action), []);

    const playing = state.phase === "playing";
    useEffect(() => {
        onPlayingChange(playing);
    }, [playing, onPlayingChange]);
    useEffect(() => () => onPlayingChange(false), [onPlayingChange]);

    // Keep the settings in the address bar so a reload or a copied URL restores them.
    useEffect(() => {
        if (!active) return;
        const url = new URL(window.location.href);
        for (const name of FREE_PLAY_PARAMS) url.searchParams.delete(name);
        settingsToParams(settings).forEach((value, name) => url.searchParams.set(name, value));
        window.history.replaceState(window.history.state, "", url.toString());
    }, [active, settings]);

    // Vocal removal draws only from vocals the server has an instrumental for.
    const vocalIds = useMemo(() => new Set(catalog.status === "loaded" ? catalog.catalog.vocalIds : []), [catalog]);
    const removeVocals = effective.vocalRemoval && vocalRemoval === "ready";
    const pool = useMemo(() => {
        if (!library) return null;
        return removeVocals ? restrictPoolToVocals(library.pool, vocalIds) : library.pool;
    }, [library, removeVocals, vocalIds]);
    const waitingForCatalog = effective.vocalRemoval && vocalRemoval === "loading";

    const startError = useMemo(() => {
        if (!pool || waitingForCatalog) return null;
        const needed = requiredPoolSize(settings.rounds, settings.answerMode === "choice" ? settings.optionsCount : 0);
        if (pool.length >= needed) return null;
        return removeVocals ? t("page.guessMusic.setup.poolTooSmallVocalRemoval") : t("page.guessMusic.setup.poolTooSmall");
    }, [pool, waitingForCatalog, removeVocals, settings.rounds, settings.answerMode, settings.optionsCount, t]);

    const start = (base: FreePlaySettings) => {
        if (!pool || waitingForCatalog) return;
        const seed = sanitizeSeed(base.seed) || createSeed();
        const next = seed === base.seed ? base : { ...base, seed };
        const rounds = buildRounds(pool, {
            seed: next.seed,
            rounds: next.rounds,
            optionsCount: next.answerMode === "choice" ? next.optionsCount : 0,
        });
        if (!rounds.length) return;
        if (next !== base) setSetup((current) => ({ ...current, settings: next }));
        dispatch({
            type: "start",
            rounds,
            config: { clipSeconds: next.clipSeconds, answerMode: next.answerMode, vocalRemoval: removeVocals, timeLimit: next.timeLimit, seed: next.seed },
        });
        window.scrollTo({ top: 0 });
    };

    const copyShareLink = () => {
        const url = shareUrlFor(effective);
        if (!navigator.clipboard) {
            setSnackbar(t("page.guessMusic.results.copyFailed"));
            return;
        }
        navigator.clipboard.writeText(url).then(
            () => setSnackbar(t("page.guessMusic.results.linkCopied")),
            () => setSnackbar(t("page.guessMusic.results.copyFailed")),
        );
    };

    const closeSnackbar = useCallback(() => setSnackbar(null), []);

    return (
        <>
            {state.phase === "playing" && library ? (
                <FreePlayGame
                    state={state}
                    dispatch={dispatch}
                    library={library}
                    assetSource={assetSource}
                    practiceApi={practiceApi}
                    onQuit={() => dispatch({ type: "quit" })}
                />
            ) : state.phase === "finished" && library ? (
                <FreePlayResults
                    state={state}
                    settings={effective}
                    preset={shownPreset}
                    library={library}
                    assetSource={assetSource}
                    shareUrl={shareUrlFor(effective)}
                    onCopyLink={copyShareLink}
                    onReplay={() => start(settings)}
                    onNewGame={() => {
                        const next = { ...settings, seed: createSeed() };
                        setSetup((current) => ({ ...current, settings: next }));
                        start(next);
                    }}
                    onBackToSetup={() => dispatch({ type: "quit" })}
                />
            ) : (
                <FreePlaySetup
                    settings={settings}
                    preset={shownPreset}
                    onChange={(nextSettings, nextPreset) =>
                        // While vocal removal is blocked the preset on screen ignores it: store the one the settings really match.
                        setSetup({ settings: nextSettings, preset: blocked && nextPreset !== "custom" ? detectPreset(nextSettings) : nextPreset })
                    }
                    vocalRemoval={vocalRemoval}
                    songCount={pool?.length ?? null}
                    loading={loading || waitingForCatalog}
                    failed={failed}
                    startError={startError}
                    onRetry={reload}
                    onStart={() => start(settings)}
                    onShare={copyShareLink}
                />
            )}
            <Snackbar open={snackbar !== null} message={snackbar ?? ""} onClose={closeSnackbar} />
        </>
    );
}
