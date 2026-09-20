import type { MolyFilters, MolyKey, MolyTab } from "./contract";

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
