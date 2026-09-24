/**
 * Card story part selection: cardEpisodes rows carry seq 1 (first part) and seq 2 (second part);
 * masterdata array order is not guaranteed to follow seq.
 */

export interface ICardStoryEpisode {
    id: number;
    cardId: number;
    seq?: number;
    title: string;
    scenarioId: string;
}

export function selectCardStoryParts<T extends { seq?: number }>(episodes: readonly T[]): [T, T] | null {
    const hasSeq = episodes.some((episode) => typeof episode.seq === "number");
    const first = hasSeq ? episodes.find((episode) => episode.seq === 1) : episodes[0];
    const second = hasSeq ? episodes.find((episode) => episode.seq === 2) : episodes[1];
    return first && second ? [first, second] : null;
}
