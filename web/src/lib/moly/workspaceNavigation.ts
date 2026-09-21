import type { MolyKey, MolyRegion, MolyTab } from "./contract";

export const MOLY_TABS = ["conversations", "furniture", "performances", "activities"] as const;
export interface BrowseState {
    tab: MolyTab;
    query: string;
    characters: number[];
    fixture: number | null;
    availability: "all" | "ready";
}
export const INITIAL_BROWSE: BrowseState = { tab: "conversations", query: "", characters: [], fixture: null, availability: "all" };
export interface FurnitureFilters {
    genre: number | null;
    subGenre: number | null;
    tag: number | null;
    characters: number[];
    units: string[];
    sortBy: "id" | "name";
    sortOrder: "asc" | "desc";
}
export const INITIAL_FURNITURE: FurnitureFilters = {
    genre: null, subGenre: null, tag: null, characters: [], units: [], sortBy: "id", sortOrder: "desc",
};
export interface WorkspaceNavigation {
    page: number;
    region: string | null;
    snapshot: string | null;
    browse: BrowseState;
    furniture: FurnitureFilters;
    content: MolyKey | null;
    invalidContent: boolean;
}

// Anything region-shaped is carried through so an unrecognised value still
// reports regionUnavailable instead of silently falling back. This only bounds
// what the source picker can be made to echo.
function regionShaped(value: string | null): string | null {
    return value !== null && /^[A-Za-z0-9_-]{1,16}$/.test(value) ? value : null;
}
export function supportedRegion(value: string | null | undefined): MolyRegion | null {
    return value === "cn" || value === "jp" ? value : null;
}
export function positiveId(value: string | null): number | null {
    if (!value || !/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) return null;
    return Number(value);
}
export function validContentKey(value: unknown): value is MolyKey {
    if (typeof value !== "string" || value.length > 160) return false;
    const parts = value.split(":");
    const numbers = parts[0] === "talk" && ["general", "fixture"].includes(parts[1]) && parts.length === 3 ? parts.slice(2)
        : parts[0] === "fixture" && parts.length === 2 ? parts.slice(1)
            : parts[0] === "activity" && ["notalk", "preaction"].includes(parts[1]) && parts.length === 4 ? parts.slice(2) : [];
    return numbers.length > 0 && numbers.every(number => positiveId(number) !== null);
}
export function parseBrowse(params: Pick<URLSearchParams, "get">): BrowseState {
    const tab = params.get("tab");
    return {
        tab: MOLY_TABS.includes(tab as MolyTab) ? tab as MolyTab : INITIAL_BROWSE.tab,
        query: Array.from(params.get("q") ?? params.get("search") ?? "").slice(0, 200).join(""),
        // Keep existing ?character=14 links, with comma-separated IDs for multi-select.
        // `characters` already belongs to the furniture-theme filter.
        characters: [...new Set((params.get("character") ?? "").split(",").map(positiveId).filter((id): id is number => id !== null))].slice(0, 64),
        fixture: positiveId(params.get("fixture")),
        availability: params.get("availability") === "ready" ? "ready" : "all",
    };
}

/** One URL model for the database and the old interaction links. No browser or renderer dependency. */
export function parseWorkspaceNavigation(params: URLSearchParams, defaultTab: MolyTab = "conversations"): WorkspaceNavigation {
    const content = params.get("content");
    const browse = parseBrowse(params);
    const legacyFixture = content?.startsWith("fixture:") ? positiveId(content.split(":")[1] ?? null) : null;
    if (legacyFixture && browse.fixture === null) browse.fixture = legacyFixture;
    if (!params.has("tab")) {
        browse.tab = content?.startsWith("activity:") ? "activities"
            : content?.startsWith("talk:fixture:") || legacyFixture || browse.fixture ? "performances"
                : content?.startsWith("talk:") ? "conversations" : defaultTab;
    } else if (browse.tab === "furniture") {
        browse.tab = content?.startsWith("activity:") ? "activities"
            : browse.fixture || legacyFixture || content?.startsWith("talk:fixture:") ? "performances"
                : "conversations";
    }
    const characters = [...new Set((params.get("characters") ?? "").split(",").map(positiveId).filter((id): id is number => id !== null))].slice(0, 31);
    const units = [...new Set((params.get("units") ?? "").split(",").filter(unit => /^[a-z0-9_-]{1,32}$/.test(unit)))].slice(0, 10);
    return {
        page: Math.min(100000, positiveId(params.get("page")) ?? 1),
        region: regionShaped(params.get("region")), snapshot: params.get("snapshot"), browse,
        furniture: {
            genre: positiveId(params.get("genre")), subGenre: positiveId(params.get("subGenre")), tag: positiveId(params.get("tag")),
            characters, units, sortBy: params.get("sortBy") === "name" ? "name" : "id", sortOrder: params.get("sortOrder") === "asc" ? "asc" : "desc",
        },
        // An explicit empty selection is meaningful in a furniture-scoped result
        // list. Old links with only ?fixture=534 still open that furniture.
        content: validContentKey(content) && !content.startsWith("fixture:") ? content : null,
        invalidContent: Boolean(content && !validContentKey(content)),
    };
}

const ownedKeys = ["region", "snapshot", "tab", "q", "search", "character", "fixture", "availability", "content", "page", "genre", "subGenre", "tag", "characters", "units", "sortBy", "sortOrder"];
export function workspaceQuery(value: WorkspaceNavigation, existing = new URLSearchParams()): URLSearchParams {
    const query = new URLSearchParams(existing);
    for (const key of ownedKeys) query.delete(key);
    if (value.region !== null) query.set("region", value.region);
    if (value.snapshot !== null) query.set("snapshot", value.snapshot);
    query.set("tab", value.browse.tab);
    if (value.page > 1) query.set("page", String(value.page));
    if (value.browse.query) query.set("q", value.browse.query);
    if (value.browse.characters.length) query.set("character", value.browse.characters.join(","));
    if (value.browse.fixture) query.set("fixture", String(value.browse.fixture));
    if (value.browse.availability !== "all") query.set("availability", value.browse.availability);
    if (value.content || value.browse.fixture) query.set("content", value.content ?? "");
    for (const key of ["genre", "subGenre", "tag"] as const) if (value.furniture[key]) query.set(key, String(value.furniture[key]));
    if (value.furniture.characters.length) query.set("characters", value.furniture.characters.join(","));
    if (value.furniture.units.length) query.set("units", value.furniture.units.join(","));
    if (value.furniture.sortBy !== "id") query.set("sortBy", value.furniture.sortBy);
    if (value.furniture.sortOrder !== "desc") query.set("sortOrder", value.furniture.sortOrder);
    return query;
}
