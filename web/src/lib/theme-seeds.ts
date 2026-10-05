import themeSeeds from "./theme-seeds.json";

/** Character theme colors used as MD3 Dynamic Color seeds (single source of truth). */
export const THEME_SEED_COLORS: Readonly<Record<string, string>> = themeSeeds.seeds;

/** Character id whose color is the default MD3 seed (Hatsune Miku). */
export const DEFAULT_THEME_SEED_ID: string = themeSeeds.defaultSeedId;

export const DEFAULT_THEME_SEED_COLOR: string = THEME_SEED_COLORS[DEFAULT_THEME_SEED_ID];

export function isThemeSeedId(value: unknown): value is string {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(THEME_SEED_COLORS, value);
}
