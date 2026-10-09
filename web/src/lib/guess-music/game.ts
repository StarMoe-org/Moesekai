/**
 * The free-play game as a pure reducer: rounds, strikes, the round timer,
 * combo and score. Time comes in with every action (`now`, in ms), so the
 * reducer never reads a clock and the rules can be tested without one.
 */
import type { RoundSpec, RoundVocal } from "./rounds";
import {
    MAX_STRIKES,
    comboMultiplier,
    nextCombo,
    scoreRound,
    timeAfterWrongGuess,
    type AnswerMode,
    type ClipSeconds,
} from "./scoring";

export type RoundOutcome = "correct" | "wrong" | "timeout" | "gaveUp" | "unavailable";
export type RoundStatus = "waiting" | "guessing" | "revealed";

export interface GameConfig {
    clipSeconds: ClipSeconds;
    answerMode: AnswerMode;
    /** Vocal removal is on: rounds play server-cut instrumental clips. */
    vocalRemoval: boolean;
    /** Seconds per question. */
    timeLimit: number;
    /** The game's seed; the server derives vocal-removal clip positions from it. */
    seed: string;
}

export interface Guess {
    /** Identity for repeat detection: "id:<musicId>" or "text:<normalized>". */
    key: string;
    /** What the player picked or typed, for display. */
    label: string;
    musicId: number | null;
}

export interface RoundState {
    index: number;
    /** waiting: the clip has not played yet, the timer stands still. */
    status: RoundStatus;
    /** Index into the round's vocals; moves on when a vocal's audio fails to load. */
    vocalIndex: number;
    clipStart: number | null;
    /** When the time runs out (ms), while guessing. */
    deadline: number | null;
    /** Time left (ms) while the timer stands still: before the clip plays and after the reveal. */
    remainingMs: number;
    strikes: number;
    /** Wrong guesses, oldest first. */
    guesses: Guess[];
}

export interface RoundResult {
    index: number;
    musicId: number;
    vocalId: number;
    clipStart: number | null;
    vocalRemovalApplied: boolean;
    outcome: RoundOutcome;
    /** The answer that ended the round (null for timeouts and give-ups). */
    finalGuess: Guess | null;
    wrongGuesses: Guess[];
    strikes: number;
    score: number;
    /** Seconds from the clip starting to the round ending. */
    timeTaken: number;
    /** Streak after this round. */
    combo: number;
    comboMultiplier: number;
}

export interface GameState {
    phase: "idle" | "playing" | "finished";
    /** Bumped on every start, so audio requests of an old game are never mistaken for new ones. */
    gameId: number;
    config: GameConfig;
    rounds: RoundSpec[];
    round: RoundState | null;
    results: RoundResult[];
    combo: number;
    score: number;
}

export type GameAction =
    | { type: "start"; rounds: RoundSpec[]; config: GameConfig }
    | { type: "clipStarted"; now: number; clipStart: number }
    | { type: "tick"; now: number }
    | { type: "guess"; now: number; correct: boolean; guess: Guess }
    | { type: "giveUp"; now: number }
    | { type: "audioFailed"; now: number }
    | { type: "next" }
    | { type: "quit" };

export function createGameState(): GameState {
    return {
        phase: "idle",
        gameId: 0,
        config: { clipSeconds: 15, answerMode: "suggest", vocalRemoval: false, timeLimit: 45, seed: "" },
        rounds: [],
        round: null,
        results: [],
        combo: 0,
        score: 0,
    };
}

function newRound(index: number, config: GameConfig): RoundState {
    return {
        index,
        status: "waiting",
        vocalIndex: 0,
        clipStart: null,
        deadline: null,
        remainingMs: config.timeLimit * 1000,
        strikes: 0,
        guesses: [],
    };
}

export function remainingMs(round: RoundState, now: number): number {
    return round.deadline === null ? round.remainingMs : Math.max(0, round.deadline - now);
}

export function currentVocal(state: GameState): RoundVocal | null {
    const round = state.round;
    const spec = round ? state.rounds[round.index] : undefined;
    if (!round || !spec) return null;
    return spec.vocals[round.vocalIndex] ?? spec.vocals[0] ?? null;
}

export function isVocalRemovalApplied(state: GameState): boolean {
    return state.config.vocalRemoval && Boolean(currentVocal(state)?.hasLyrics);
}

/** Points a right answer would earn now (0 once the round is over). */
export function potentialScore(state: GameState, now: number): number {
    const round = state.round;
    if (state.phase !== "playing" || !round || round.status === "revealed") return 0;
    return scoreRound({
        timeLeft: remainingMs(round, now) / 1000,
        timeLimit: state.config.timeLimit,
        clipSeconds: state.config.clipSeconds,
        answerMode: state.config.answerMode,
        vocalRemovalApplied: isVocalRemovalApplied(state),
        combo: nextCombo(state.combo, round.strikes, true),
    });
}

function resolve(state: GameState, outcome: RoundOutcome, now: number, finalGuess: Guess | null): GameState {
    const round = state.round;
    const spec = round ? state.rounds[round.index] : undefined;
    if (!round || !spec || round.status === "revealed") return state;
    const left = remainingMs(round, now);
    const started = round.status === "guessing";
    const correct = outcome === "correct";
    // A song whose audio never loaded neither builds nor breaks the streak.
    const combo = outcome === "unavailable" ? state.combo : nextCombo(state.combo, round.strikes, correct);
    const vocal = currentVocal(state);
    const vocalRemovalApplied = isVocalRemovalApplied(state);
    const score = correct
        ? scoreRound({
            timeLeft: left / 1000,
            timeLimit: state.config.timeLimit,
            clipSeconds: state.config.clipSeconds,
            answerMode: state.config.answerMode,
            vocalRemovalApplied,
            combo,
        })
        : 0;
    const result: RoundResult = {
        index: round.index,
        musicId: spec.musicId,
        vocalId: vocal?.vocalId ?? 0,
        clipStart: round.clipStart,
        vocalRemovalApplied,
        outcome,
        finalGuess,
        wrongGuesses: round.guesses,
        strikes: round.strikes,
        score,
        timeTaken: started ? Math.max(0, state.config.timeLimit - left / 1000) : 0,
        combo,
        comboMultiplier: correct ? comboMultiplier(combo) : 1,
    };
    return {
        ...state,
        round: { ...round, status: "revealed", deadline: null, remainingMs: left },
        results: [...state.results, result],
        combo,
        score: state.score + score,
    };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
        case "start": {
            if (!action.rounds.length) return state;
            return {
                phase: "playing",
                gameId: state.gameId + 1,
                config: action.config,
                rounds: action.rounds,
                round: newRound(0, action.config),
                results: [],
                combo: 0,
                score: 0,
            };
        }
        case "clipStarted": {
            const round = state.round;
            if (state.phase !== "playing" || !round || round.status === "revealed") return state;
            if (round.status === "guessing") {
                return round.clipStart === null ? { ...state, round: { ...round, clipStart: action.clipStart } } : state;
            }
            return {
                ...state,
                round: { ...round, status: "guessing", clipStart: action.clipStart, deadline: action.now + round.remainingMs },
            };
        }
        case "tick": {
            const round = state.round;
            if (state.phase !== "playing" || round?.status !== "guessing") return state;
            return remainingMs(round, action.now) <= 0 ? resolve(state, "timeout", action.now, null) : state;
        }
        case "guess": {
            const round = state.round;
            if (state.phase !== "playing" || round?.status !== "guessing") return state;
            if (remainingMs(round, action.now) <= 0) return resolve(state, "timeout", action.now, null);
            if (action.correct) return resolve(state, "correct", action.now, action.guess);
            // The same wrong answer twice costs nothing the second time.
            if (round.guesses.some((guess) => guess.key === action.guess.key)) return state;
            const strikes = round.strikes + 1;
            const guesses = [...round.guesses, action.guess];
            if (strikes >= MAX_STRIKES) {
                return resolve({ ...state, round: { ...round, strikes, guesses } }, "wrong", action.now, action.guess);
            }
            const deadline = action.now + timeAfterWrongGuess(remainingMs(round, action.now));
            return { ...state, combo: 0, round: { ...round, strikes, guesses, deadline } };
        }
        case "giveUp": {
            const round = state.round;
            if (state.phase !== "playing" || !round || round.status === "revealed") return state;
            return resolve(state, "gaveUp", action.now, null);
        }
        case "audioFailed": {
            const round = state.round;
            // Once the clip has played the player has heard it; a later failure (say, on a replay) changes nothing.
            if (state.phase !== "playing" || round?.status !== "waiting") return state;
            const spec = state.rounds[round.index];
            if (spec && round.vocalIndex + 1 < spec.vocals.length) {
                return { ...state, round: { ...round, vocalIndex: round.vocalIndex + 1, clipStart: null } };
            }
            return resolve(state, "unavailable", action.now, null);
        }
        case "next": {
            const round = state.round;
            if (state.phase !== "playing" || round?.status !== "revealed") return state;
            const index = round.index + 1;
            if (index >= state.rounds.length) return { ...state, phase: "finished" };
            return { ...state, round: newRound(index, state.config) };
        }
        case "quit":
            return { ...createGameState(), gameId: state.gameId };
        default:
            return state;
    }
}

export function correctCount(results: readonly RoundResult[]): number {
    return results.filter((result) => result.outcome === "correct").length;
}

export function maxCombo(results: readonly RoundResult[]): number {
    return results.reduce((best, result) => Math.max(best, result.combo), 0);
}
