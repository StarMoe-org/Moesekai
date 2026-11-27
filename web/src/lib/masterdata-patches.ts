/**
 * Masterdata post-patch system.
 *
 * Upstream masterdata sometimes carries wrong fields and we cannot edit the
 * original feed. This module declares additive patches that dynamically
 * override bad values right before the data is consumed by the UI.
 *
 * Patches are applied centrally at the `fetchMasterData` /
 * `fetchMasterDataForServer` exit points (see lib/fetch.ts), so every
 * consumer gets patched data automatically while the IndexedDB cache keeps
 * the ORIGINAL payload (patches stay ephemeral — when upstream fixes the
 * data, a version bump clears the cache and patches become no-ops).
 *
 * Pure functions, zero runtime imports (ServerSourceType is type-only).
 */
import type { ServerSourceType } from "./fetch";

export type PatchFile = "cards" | "eventStories";

export interface MasterdataPatch {
    /** Stable identifier (used in tests / tooling) */
    id: string;
    /** Target masterdata file (logical name, see patchFileForPath) */
    file: PatchFile;
    /** Optional: restrict to specific server(s). Omit to apply to ALL servers. */
    server?: ServerSourceType | ServerSourceType[];
    /** Match condition: exact id, or inclusive id range [lo, hi] */
    match: { id: number | [number, number] };
    /** Fields to override on matched entries */
    patch: Record<string, unknown>;
    /** Human-readable reason (documentation only) */
    note?: string;
}

/**
 * Registered patches. All current entries intentionally omit `server`
 * so they take effect on every server region.
 */
export const MASTERDATA_PATCHES: MasterdataPatch[] = [
    {
        id: "cards-1345-1347-supply",
        file: "cards",
        match: { id: [1345, 1347] },
        patch: { cardSupplyId: 3 },
        note: "Term-limited 4★ cards mislabeled as normal (cardSupplyId 1→3)",
    },
    {
        id: "cards-1489-1491-supply",
        file: "cards",
        match: { id: [1489, 1491] },
        patch: { cardSupplyId: 3 },
        note: "Term-limited 4★ cards (Lit in the Dark gacha) mislabeled as normal (cardSupplyId 1→3)",
    },
    {
        id: "eventstories-97-banner",
        file: "eventStories",
        match: { id: 97 },
        patch: { bannerGameCharacterUnitId: 10 },
        note: "Event 97 banner character should be character 10 (was unit id 9)",
    },
];

/**
 * Map a masterdata path to its logical patch file name.
 * "cards.json" → "cards", "eventStories.json" → "eventStories"; null if unknown.
 */
export function patchFileForPath(path: string): PatchFile | null {
    const base = path.split("/").pop() ?? "";
    const name = base.replace(/\.json$/, "");
    if (name === "cards" || name === "eventStories") return name;
    return null;
}

function matchesId(id: unknown, spec: number | [number, number]): boolean {
    if (typeof id !== "number") return false;
    if (Array.isArray(spec)) return id >= spec[0] && id <= spec[1];
    return id === spec;
}

function matchesServer(server: ServerSourceType, patch: MasterdataPatch): boolean {
    if (patch.server === undefined) return true;
    if (Array.isArray(patch.server)) return patch.server.includes(server);
    return patch.server === server;
}

/**
 * Apply patches to a masterdata payload (array of records).
 * - Matched entries get `{ ...item, ...patch }` (new object — original data untouched)
 * - Returns a NEW array when anything matched; otherwise returns `data` unchanged
 * - `patches` is injectable for tests (defaults to the registered table)
 */
export function applyMasterdataPatches<T>(
    file: PatchFile,
    server: ServerSourceType,
    data: T,
    patches: readonly MasterdataPatch[] = MASTERDATA_PATCHES,
): T {
    const applicable = patches.filter((p) => p.file === file && matchesServer(server, p));
    if (applicable.length === 0 || !Array.isArray(data)) return data;

    let changed = false;
    const patched = (data as readonly Record<string, unknown>[]).map((item) => {
        let next: Record<string, unknown> | null = null;
        for (const patch of applicable) {
            if (matchesId(item.id, patch.match.id)) {
                next = { ...(next ?? item), ...patch.patch };
            }
        }
        if (next !== null) {
            changed = true;
            return next;
        }
        return item;
    });

    return (changed ? patched : data) as T;
}