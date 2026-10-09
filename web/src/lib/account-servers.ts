/**
 * Shared game-server (region) constants for the Moesekai account system.
 *
 * Lives in its own module so that both `lib/account.ts` and `lib/oauth.ts` can
 * consume it without creating a runtime import cycle between them.
 *
 * All five official regions are supported: our masterdata mirror, the Haruki
 * public suite API and the OAuth2 upstream all serve every region, so there is
 * no per-region fallback strategy anymore — each account reads the masterdata
 * of its own server.
 */

export type ServerType = "cn" | "jp" | "tw" | "kr" | "en";

export const SERVER_IDS: ServerType[] = ["cn", "jp", "tw", "kr", "en"];

export const SERVER_LABEL_KEYS: Record<ServerType, string> = {
    cn: "common.server.cn",
    jp: "common.server.jp",
    tw: "common.server.tw",
    kr: "common.server.kr",
    en: "common.server.en",
};

/** A word or a code per server, for pickers that lay all five out in one row. */
export const SERVER_SHORT_LABEL_KEYS: Record<ServerType, string> = {
    cn: "common.serverShort.cn",
    jp: "common.serverShort.jp",
    tw: "common.serverShort.tw",
    kr: "common.serverShort.kr",
    en: "common.serverShort.en",
};

export const SERVER_OPTIONS: { value: ServerType; labelKey: string }[] = SERVER_IDS.map((value) => ({
    value,
    labelKey: SERVER_LABEL_KEYS[value],
}));

export function isValidServer(value: unknown): value is ServerType {
    return typeof value === "string" && (SERVER_IDS as string[]).includes(value);
}

/** Normalize an arbitrary region string (e.g. "JP", " cn ") to a ServerType. */
export function normalizeServer(value: unknown): ServerType | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    return isValidServer(normalized) ? normalized : null;
}
