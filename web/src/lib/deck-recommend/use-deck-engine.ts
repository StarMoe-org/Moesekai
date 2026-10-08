"use client";

/**
 * Deck-engine worker lifecycle shared by the deck-recommend page and the ranking-goal planner:
 * one resident worker (warmup, progress, result, music rows, cancel, errors) behind React state,
 * plus the promise-based PlannerDeckEngine API on the same worker.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { getOAuthAccessTokenForGameUser, type ServerType } from "@/lib/account";
import { preloadDeckEngine, type DeckSearchCompletion } from "@/lib/deck-engine/wasm-loader";
import { fetchMasterDataForServer, fetchMusicMetas } from "@/lib/fetch";
import type { IMusicInfo } from "@/types/music";
import type { DeckMusicRow, DeckResultDeck, DeckUserCard, DeckWorkerInput, DeckWorkerOutput } from "./engine-types";
import {
    buildPlannerMusicRequest,
    buildPlannerWorkerArgs,
    buildSongGainCatalog,
    buildSongGainRows,
    plannerDeckOptions,
    type DeckMusicRequest,
    type SongGainCatalog,
} from "./planner-args";
import type {
    PlannerDeckEngine,
    PlannerDeckOption,
    PlannerDeckRequest,
    PlannerSongGainRequest,
    PlannerSongGainRow,
} from "./planner-types";

type TranslationFn = ReturnType<typeof useI18n>["t"];

type WorkerMessage =
    | DeckWorkerOutput
    | { type: "music"; requestId: number; rows: DeckMusicRow[] }
    | { type: "warm"; ready: boolean };

interface PendingRun {
    resolve?: (decks: DeckResultDeck[]) => void;
    reject?: (error: Error) => void;
    onSuccess?: () => void;
}

interface PendingMusic {
    resolve: (rows: DeckMusicRow[]) => void;
    reject: (error: Error) => void;
}

/** Rejection reason of planner calls cut short by cancel() or unmount. */
export class DeckEngineAbortError extends Error {
    constructor() {
        super("deck engine request cancelled");
        this.name = "AbortError";
    }
}

export function getDeckErrorMessage(error: string, t: TranslationFn): string {
    switch (error) {
        case "INVALID_SEARCH_COMPLETION":
            return t("page.deckRecommend.errors.engineVersion");
        case "USER_NOT_FOUND":
            return t("page.deckRecommend.errors.userNotFound");
        case "API_NOT_PUBLIC":
            return t("page.deckRecommend.errors.apiNotPublic");
        default:
            if (error.includes("404")) return t("page.deckRecommend.errors.userNotFound404");
            if (error.includes("403")) return t("page.deckRecommend.errors.apiNotPublic403");
            return error;
    }
}

export interface DeckEngineState extends PlannerDeckEngine {
    isCalculating: boolean;
    progressPercent: number;
    progressLabel: string;
    results: DeckResultDeck[] | null;
    userCards: DeckUserCard[];
    duration: number | null;
    completion: DeckSearchCompletion | null;
    /** Song ranking rows per deck rank (deck-recommend page); cleared when a run starts or is cancelled. */
    musicByDeck: Record<number, DeckMusicRow[] | null>;
    musicLoadingByDeck: Record<number, boolean>;
    setError(message: string | null): void;
    /** Background preload of the wasm, the server's master data and the account's user data. */
    warmup(server: ServerType, userId: string): void;
    /**
     * Deck-page calculation: resets the run state, then posts the built args; a returned `{ error }`
     * ends the run with that message instead.
     */
    runDeck(build: () => DeckWorkerInput | { error: string }, options?: { onSuccess?: () => void }): void;
    /** `request.requestId` is the deck rank the rows are stored under. */
    requestDeckMusic(request: DeckMusicRequest): void;
}

export function useDeckEngine(): DeckEngineState {
    const { t } = useI18n();
    const tRef = useRef(t);
    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const [isCalculating, setIsCalculating] = useState(false);
    const [progressPercent, setProgressPercent] = useState(0);
    const [progressLabel, setProgressLabel] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<DeckResultDeck[] | null>(null);
    const [userCards, setUserCards] = useState<DeckUserCard[]>([]);
    const [duration, setDuration] = useState<number | null>(null);
    const [completion, setCompletion] = useState<DeckSearchCompletion | null>(null);
    const [musicByDeck, setMusicByDeck] = useState<Record<number, DeckMusicRow[] | null>>({});
    const [musicLoadingByDeck, setMusicLoadingByDeck] = useState<Record<number, boolean>>({});
    const [status, setStatus] = useState<PlannerDeckEngine["status"]>("idle");

    const workerRef = useRef<Worker | null>(null);
    /** Engine master data is loaded in the current worker (music rows do not depend on the server). */
    const readyRef = useRef(false);
    const pendingRunRef = useRef<PendingRun | null>(null);
    const pendingMusicRef = useRef(new Map<number, PendingMusic>());
    /** Deck-page music requests of the current run: posted id -> deck rank. */
    const deckMusicRef = useRef(new Map<number, number>());
    const warmWaitersRef = useRef<((ready: boolean) => void)[]>([]);
    /** Warmups posted to the current worker and not yet answered; replies carry no id and may arrive out of order. */
    const warmInflightRef = useRef(0);
    const nextMusicIdRef = useRef(1);
    const catalogRef = useRef(new Map<string, Promise<SongGainCatalog>>());

    const settlePending = useCallback((reason: Error) => {
        const run = pendingRunRef.current;
        pendingRunRef.current = null;
        run?.reject?.(reason);
        const music = [...pendingMusicRef.current.values()];
        pendingMusicRef.current.clear();
        for (const pending of music) pending.reject(reason);
        const waiters = warmWaitersRef.current;
        warmWaitersRef.current = [];
        for (const waiter of waiters) waiter(false);
    }, []);

    const getOrCreateWorker = useCallback(() => {
        if (workerRef.current) return workerRef.current;
        const worker = new Worker(new URL("@/lib/deck-recommend/engine-worker.ts", import.meta.url));
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
            const data = event.data;
            if (data.type === "warm") {
                warmInflightRef.current = Math.max(0, warmInflightRef.current - 1);
                if (data.ready) readyRef.current = true;
                const settled = readyRef.current || warmInflightRef.current === 0;
                setStatus(readyRef.current ? "ready" : settled ? "error" : "warming");
                // A failed user-data warmup must not fail a master-only warmup still in flight.
                if (settled) {
                    const waiters = warmWaitersRef.current;
                    warmWaitersRef.current = [];
                    for (const waiter of waiters) waiter(readyRef.current);
                }
                return;
            }
            if (data.type === "progress") {
                setProgressPercent(data.percent);
                setProgressLabel(data.progressKey ? tRef.current(data.progressKey) : data.stageLabel ?? "");
                return;
            }
            if (data.type === "music") {
                const requestId = data.requestId ?? 0;
                const pending = pendingMusicRef.current.get(requestId);
                if (pending) {
                    pendingMusicRef.current.delete(requestId);
                    pending.resolve(data.rows ?? []);
                    return;
                }
                const rank = deckMusicRef.current.get(requestId);
                // Replies to requests made before the current run belong to other decks.
                if (rank === undefined) return;
                deckMusicRef.current.delete(requestId);
                setMusicLoadingByDeck((prev) => ({ ...prev, [rank]: false }));
                setMusicByDeck((prev) => ({ ...prev, [rank]: data.rows ?? [] }));
                return;
            }
            const run = pendingRunRef.current;
            pendingRunRef.current = null;
            if (data.error) {
                const message = getDeckErrorMessage(data.error, tRef.current);
                setError(message);
                setStatus("error");
                run?.reject?.(new Error(message));
            } else {
                const decks = data.result ?? [];
                setResults(decks);
                if (data.userCards) setUserCards(data.userCards);
                setDuration(data.duration ?? null);
                setCompletion(data.completion ?? null);
                readyRef.current = true;
                setStatus("ready");
                run?.onSuccess?.();
                run?.resolve?.(decks);
            }
            setIsCalculating(false);
            setProgressPercent(0);
        };
        worker.onerror = (err) => {
            const message = tRef.current("page.deckRecommend.errors.workerError", { message: err.message });
            setError(message);
            setIsCalculating(false);
            setProgressPercent(0);
            setStatus("error");
            settlePending(new Error(message));
        };
        workerRef.current = worker;
        return worker;
    }, [settlePending]);

    const warmup = useCallback((server: ServerType, userId: string) => {
        preloadDeckEngine();
        const worker = getOrCreateWorker();
        const trimmedUid = userId.trim();
        const oauthAccessToken = trimmedUid ? getOAuthAccessTokenForGameUser(server, trimmedUid) : undefined;
        if (!readyRef.current) setStatus("warming");
        warmInflightRef.current += 1;
        worker.postMessage({
            warmup: {
                server,
                userId: trimmedUid || undefined,
                oauthAccessToken,
            },
        });
    }, [getOrCreateWorker]);

    const postRun = useCallback((args: DeckWorkerInput, pending: PendingRun) => {
        const worker = getOrCreateWorker();
        pendingRunRef.current = pending;
        if (!readyRef.current) setStatus("warming");
        const oauthAccessToken = getOAuthAccessTokenForGameUser(args.server as ServerType, args.userId.trim());
        worker.postMessage({ args: { ...args, oauthAccessToken } });
    }, [getOrCreateWorker]);

    const clearDeckMusic = useCallback(() => {
        deckMusicRef.current.clear();
        setMusicByDeck({});
        setMusicLoadingByDeck({});
    }, []);

    const beginRun = useCallback(() => {
        setError(null);
        setIsCalculating(true);
        setResults(null);
        setDuration(null);
        setCompletion(null);
        clearDeckMusic();
        setProgressPercent(5);
        setProgressLabel(tRef.current("page.deckRecommend.progress.fetchingUserData"));
    }, [clearDeckMusic]);

    const runDeck = useCallback((build: () => DeckWorkerInput | { error: string }, options?: { onSuccess?: () => void }) => {
        beginRun();
        const built = build();
        if ("error" in built) {
            setError(built.error);
            setIsCalculating(false);
            return;
        }
        postRun(built, { onSuccess: options?.onSuccess });
    }, [beginRun, postRun]);

    const dropWorker = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
        readyRef.current = false;
        warmInflightRef.current = 0;
    }, []);

    const cancel = useCallback(() => {
        dropWorker();
        setIsCalculating(false);
        setProgressPercent(0);
        setStatus("idle");
        clearDeckMusic();
        settlePending(new DeckEngineAbortError());
    }, [clearDeckMusic, dropWorker, settlePending]);

    const requestDeckMusic = useCallback((request: DeckMusicRequest) => {
        const worker = getOrCreateWorker();
        const requestId = nextMusicIdRef.current++;
        deckMusicRef.current.set(requestId, request.requestId);
        setMusicLoadingByDeck((prev) => ({ ...prev, [request.requestId]: true }));
        worker.postMessage({ music: { ...request, requestId } });
    }, [getOrCreateWorker]);

    const recommend = useCallback((req: PlannerDeckRequest): Promise<PlannerDeckOption[]> => {
        // One search at a time per worker: a new search replaces the running one.
        if (pendingRunRef.current) cancel();
        return new Promise<PlannerDeckOption[]>((resolve, reject) => {
            beginRun();
            try {
                postRun(buildPlannerWorkerArgs(req), {
                    resolve: (decks) => resolve(plannerDeckOptions(decks)),
                    reject,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                setError(message);
                setIsCalculating(false);
                setProgressPercent(0);
                reject(err instanceof Error ? err : new Error(message));
            }
        });
    }, [beginRun, cancel, postRun]);

    const ensureReady = useCallback(async (server: ServerType) => {
        if (readyRef.current) return;
        const ready = await new Promise<boolean>((resolve) => {
            warmWaitersRef.current.push(resolve);
            warmup(server, "");
        });
        if (!ready) {
            if (!workerRef.current) throw new DeckEngineAbortError();
            throw new Error("deck engine warmup failed");
        }
    }, [warmup]);

    const loadCatalog = useCallback((server: ServerType) => {
        const cached = catalogRef.current.get(server);
        if (cached) return cached;
        const promise = Promise.all([
            fetchMasterDataForServer<IMusicInfo[]>(server, "musics.json"),
            fetchMusicMetas(),
        ]).then(([musics, metas]) => buildSongGainCatalog(musics, metas, Date.now()));
        promise.catch(() => catalogRef.current.delete(server));
        catalogRef.current.set(server, promise);
        return promise;
    }, []);

    const songGains = useCallback(async (req: PlannerSongGainRequest): Promise<PlannerSongGainRow[]> => {
        const catalogPromise = loadCatalog(req.server);
        await ensureReady(req.server);
        const worker = getOrCreateWorker();
        const requestId = nextMusicIdRef.current++;
        const rows = await new Promise<DeckMusicRow[]>((resolve, reject) => {
            pendingMusicRef.current.set(requestId, { resolve, reject });
            worker.postMessage({ music: buildPlannerMusicRequest(req, requestId) });
        });
        return buildSongGainRows(rows, await catalogPromise, req);
    }, [ensureReady, getOrCreateWorker, loadCatalog]);

    useEffect(() => {
        return () => {
            dropWorker();
            settlePending(new DeckEngineAbortError());
        };
    }, [dropWorker, settlePending]);

    const progress = useMemo(
        () => (isCalculating ? { percent: progressPercent, label: progressLabel } : null),
        [isCalculating, progressPercent, progressLabel],
    );

    return useMemo(() => ({
        status,
        error,
        progress,
        recommend,
        songGains,
        cancel,
        isCalculating,
        progressPercent,
        progressLabel,
        results,
        userCards,
        duration,
        completion,
        musicByDeck,
        musicLoadingByDeck,
        setError,
        warmup,
        runDeck,
        requestDeckMusic,
    }), [
        status, error, progress, recommend, songGains, cancel, isCalculating, progressPercent,
        progressLabel, results, userCards, duration, completion, musicByDeck, musicLoadingByDeck, warmup,
        runDeck, requestDeckMusic,
    ]);
}
