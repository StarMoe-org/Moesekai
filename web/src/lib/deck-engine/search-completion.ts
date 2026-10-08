/** Serialized allium-deck SearchCompletion values. */
export type DeckSearchCompletion = "complete" | "timed_out";

/** Reject stale or inconsistent engines instead of treating an unproven result as complete. */
export function readSearchCompletion(response: {
    completion?: unknown;
    timed_out?: unknown;
}): DeckSearchCompletion {
    const { completion, timed_out: timedOut } = response;
    if ((completion !== "complete" && completion !== "timed_out")
        || timedOut !== (completion === "timed_out")) {
        throw new Error("INVALID_SEARCH_COMPLETION");
    }
    return completion;
}
