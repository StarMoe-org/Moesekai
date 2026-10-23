/**
 * Where the 3D costume pages read SekaiExtraRipper's costume output from (ADR-0020): one
 * directory per game server, `<base>/<region>/`, holding `index/` and `library/`.
 *
 * - `NEXT_PUBLIC_COSTUME3D_BASE`: the directory of those per-server directories; the default
 *   is the published one on assets.pjsk.moe.
 * - `NEXT_PUBLIC_COSTUME3D_REGIONS`: the servers that have been published there, separated by
 *   commas (default `jp,cn`). A server left out has no 3D costumes.
 *
 * Values must already be canonical (what the URL parser gives back), https, or http on a
 * loopback host for development.
 */

/** The game servers a costume output can be published for. */
export const COSTUME3D_REGIONS = ["jp", "cn", "tw", "kr", "en"] as const;

export type Costume3dRegion = (typeof COSTUME3D_REGIONS)[number];

const DEFAULT_BASE = "https://assets.pjsk.moe/sekai-extra-assets/costume3d/";
const DEFAULT_REGIONS = "jp,cn";

/**
 * The format versions this reader understands. An output whose `index/version.json` lists
 * anything else is not read (the ripper's ADR-0013 rule), so a newer export never renders
 * wrongly here; it waits for this table to be updated with the reader.
 */
export const COSTUME3D_FORMATS: Readonly<Record<string, number>> = {
    "costume3d-catalog": 1,
    "costume3d-components": 1,
    "costume3d-costume": 1,
    "costume3d-lock": 1,
    "costume3d-motion": 1,
    "costume3d-part": 2,
    "costume3d-roles": 1,
    "costume3d-version": 1,
};

function base(): string {
    const name = "NEXT_PUBLIC_COSTUME3D_BASE";
    const invalid = new Error(`costume3d_config_invalid:${name}`);
    const raw = process.env.NEXT_PUBLIC_COSTUME3D_BASE?.trim() || DEFAULT_BASE;
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw invalid;
    }
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (/[?#\\\s]/.test(raw) || !(parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback))
        || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash
        || !parsed.pathname.endsWith("/") || parsed.pathname.split("/").some(part => part === "." || part === "..")
        || raw !== parsed.href) throw invalid;
    return parsed.href;
}

/** The servers with a published costume output, in the order of `COSTUME3D_REGIONS`. */
export function costume3dRegions(): Costume3dRegion[] {
    const invalid = new Error("costume3d_config_invalid:NEXT_PUBLIC_COSTUME3D_REGIONS");
    const raw = process.env.NEXT_PUBLIC_COSTUME3D_REGIONS?.trim() || DEFAULT_REGIONS;
    const named = raw.split(",").map(region => region.trim());
    if (named.some(region => !COSTUME3D_REGIONS.includes(region as Costume3dRegion))
        || new Set(named).size !== named.length) throw invalid;
    return COSTUME3D_REGIONS.filter(region => named.includes(region));
}

/** The directory of `region`'s costume output, or null when that server has none. */
export function costume3dSource(region: string): string | null {
    if (!costume3dRegions().includes(region as Costume3dRegion)) return null;
    return `${base()}${region}/`;
}

/** Checks every value the functions above read; a wrong one throws. For the build. */
export function costume3dCheckConfig(): void {
    base();
    costume3dRegions();
}
