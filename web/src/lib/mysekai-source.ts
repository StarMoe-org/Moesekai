import type { ServerSourceType } from "@/contexts/ThemeContext";

/** A furniture ID is meaningful only together with its actual masterdata server. */
export function mysekaiSource(value: string | null, fallback: ServerSourceType): ServerSourceType | null {
    if (value === null) return fallback;
    return ["cn", "jp", "en", "tw", "kr"].includes(value) ? value as ServerSourceType : null;
}

export function mysekaiDatabaseHref(region: ServerSourceType, fixtureId?: number): string {
    if (fixtureId !== undefined && (!Number.isSafeInteger(fixtureId) || fixtureId <= 0)) throw new Error("Invalid furniture identity");
    return `${fixtureId === undefined ? "/mysekai/" : `/mysekai/${fixtureId}/`}?region=${region}`;
}
