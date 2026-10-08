export interface WorldBloomChapterRow {
    eventId: number;
    worldBloomChapterType?: string;
}

/** Shared by the page and worker: future finales are identified from their master rows. */
export function isWorldBloomFinale(
    eventId: number | undefined,
    worldBloomRows: readonly WorldBloomChapterRow[],
): boolean {
    // Engine compatibility IDs for the legacy and simulated finales.
    return eventId === 180 || eventId === 3200000 || worldBloomRows.some(
        (row) => row.eventId === eventId && row.worldBloomChapterType === "finale",
    );
}
