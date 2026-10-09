import { normalizeAnswer } from "./answer";
import { vocalHasLyrics, type PoolSong } from "./pool";
import { createRandom } from "./random";

/** Silence kept clear at the end of the track, so a clip never runs into the fade-out. */
export const CLIP_TAIL_PADDING_SECONDS = 3;

export interface RoundVocal {
    vocalId: number;
    hasLyrics: boolean;
}

export interface RoundSpec {
    index: number;
    musicId: number;
    /** The drawn vocal first, then the song's other vocals as fallbacks if its audio fails. */
    vocals: RoundVocal[];
    /** Where the clip starts within the playable range, 0..1; resolved once the duration is known. */
    startFraction: number;
    /** Choice mode: the shuffled options, answer included. Empty for typing modes. */
    optionIds: number[];
}

export interface BuildRoundsOptions {
    seed: string;
    rounds: number;
    /** Options per question for choice mode; 0 for the typing modes. */
    optionsCount: number;
}

export function requiredPoolSize(rounds: number, optionsCount: number): number {
    return Math.max(rounds, optionsCount);
}

/**
 * The questions of a game, fully determined by the seed and the pool. Songs,
 * vocals and clip positions do not depend on the answer mode or clip length,
 * so the same seed plays the same songs at every difficulty.
 */
export function buildRounds(pool: readonly PoolSong[], { seed, rounds, optionsCount }: BuildRoundsOptions): RoundSpec[] {
    if (pool.length < requiredPoolSize(rounds, optionsCount)) return [];
    const picked = createRandom(`${seed}|songs`).sample(pool, rounds);
    const titleKey = (song: PoolSong) => normalizeAnswer(song.music.title) || `#${song.music.id}`;

    return picked.map((song, index) => {
        const random = createRandom(`${seed}|round|${index}|${song.music.id}`);
        const drawn = random.pick(song.vocals) ?? song.vocals[0];
        const ordered = [drawn, ...song.vocals.filter((vocal) => vocal.id !== drawn.id)];
        const startFraction = random.next();

        let optionIds: number[] = [];
        if (optionsCount > 1) {
            const optionRandom = createRandom(`${seed}|options|${index}|${song.music.id}`);
            const answerTitle = titleKey(song);
            // Re-releases share a title; one of them as a distractor would be a second right answer.
            const candidates = pool.filter((other) => other.music.id !== song.music.id && titleKey(other) !== answerTitle);
            const distractors = optionRandom.sample(candidates, optionsCount - 1);
            optionIds = optionRandom.shuffle([...distractors, song]).map((option) => option.music.id);
        }

        return {
            index,
            musicId: song.music.id,
            vocals: ordered.map((vocal) => ({ vocalId: vocal.id, hasLyrics: vocalHasLyrics(vocal) })),
            startFraction,
            optionIds,
        };
    });
}

/**
 * The clip start in seconds: inside [fillerSec, duration - clipSeconds - padding],
 * past the silent lead-in and clear of the ending. Short tracks fall back to
 * the latest start that still fits the clip.
 */
export function resolveClipStart(
    startFraction: number,
    fillerSec: number,
    duration: number,
    clipSeconds: number,
    tailPadding: number = CLIP_TAIL_PADDING_SECONDS,
): number {
    const earliest = Math.max(0, Number.isFinite(fillerSec) ? fillerSec : 0);
    if (!Number.isFinite(duration) || duration <= 0) return round2(earliest);
    const latest = duration - clipSeconds - tailPadding;
    if (latest <= earliest) return round2(Math.max(0, Math.min(earliest, duration - clipSeconds)));
    const fraction = Math.min(1, Math.max(0, Number.isFinite(startFraction) ? startFraction : 0));
    return round2(earliest + fraction * (latest - earliest));
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/** mm:ss, e.g. 83.4 -> "01:23". */
export function formatClock(seconds: number): string {
    const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
