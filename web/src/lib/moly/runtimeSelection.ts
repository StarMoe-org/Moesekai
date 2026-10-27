import type { MolyError, MolyFilters, MolyKey, MolySnapshot, MolyTab } from "./contract";

/** A later exact-key admission supersedes a nonfatal initial selection refusal. */
export function reconcileSelectionError(error: MolyError | null, snapshot: MolySnapshot | null): MolyError | null {
    if (error?.code !== "selection_unavailable" || error.fatal || !error.key) return error;
    if (!snapshot?.ready || snapshot.status.phase === "error" || snapshot.status.error) return error;
    return snapshot.selected?.key === error.key && snapshot.selected.available ? null : error;
}

/**
 * The workspace's reading results and the stage's selected source are separate
 * views. A related dialogue can be opened while the furniture list still has
 * its own query, page, or character filters. Never feed those presentation
 * filters to Rust's exact-key admission check.
 *
 * Keep the full source category visible to the stage; Rust still validates the
 * exact key, source availability, and current-scene eligibility. No fallback
 * selection or automatic playback is synthesized here.
 */
export function runtimeSelectionFilters(key: MolyKey | null, mode: "independent" | "current", fallbackTab: MolyTab = "conversations"): MolyFilters {
    const tab = key?.startsWith("fixture:") ? "furniture"
        : key?.startsWith("activity:") ? "activities"
            : key?.startsWith("talk:") ? "conversations" : fallbackTab;
    return { tab, query: "", character: null, fixture: null, availability: "all", mode, page: 0, pageSize: 24 };
}
