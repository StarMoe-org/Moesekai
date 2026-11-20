import { ASSET_DOMAIN_MAIN } from "../assetDomains";

/**
 * Where the 3D costume pages read a published exporter output from: `NEXT_PUBLIC_COSTUME3D_BASE`
 * is the root of a resolver that serves the canonical view of each server at `<region>/` and of
 * one of its versions at `<region>@<version>/`. The default is the main asset line.
 *
 * - `NEXT_PUBLIC_COSTUME3D_REGIONS`: the servers that have been published there, separated by
 *   commas (default all five). A server left out has no 3D costumes.
 *
 * Values must already be canonical (what the URL parser gives back), https, or http on a
 * loopback host for development.
 */

/** The game servers a costume output can be published for. */
export const COSTUME3D_REGIONS = ["jp", "cn", "tw", "kr", "en"] as const;

export type Costume3dRegion = (typeof COSTUME3D_REGIONS)[number];

const DEFAULT_BASE = `${ASSET_DOMAIN_MAIN}/`;
const DEFAULT_REGIONS = "jp,cn,tw,kr,en";

/**
 * The versions of the documents this reader understands, by `format`: the directory listings of
 * the resolver, the costume documents (`costume.md`), clip documents and component documents.
 * Anything else is not read (as ADR-0013 of the former costume output had it), so a newer export
 * never renders wrongly here; it waits for this table to be updated with the reader.
 */
export const COSTUME3D_FORMATS: Readonly<Record<string, number>> = {
    "directory-listing": 1,
    "costume-role": 1,
    costume: 1,
    clip: 2,
    components: 1,
    /* The document of an asset; its form's version is `form_version`. */
    asset: 1,
};

/** The `form_version` of each asset form this reader reads. */
export const COSTUME3D_FORMS: Readonly<Record<string, number>> = {
    "costume-role": 1,
    costume: 1,
    "costume-model": 2,
    "costume-motion": 1,
    texture: 3,
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

/** The canonical view of `region`'s output, the view that holds every asset, or null when that server has none. */
export function costume3dSource(region: string): string | null {
    if (!costume3dRegions().includes(region as Costume3dRegion)) return null;
    return `${base()}${region}/`;
}

/** Checks every value the functions above read; a wrong one throws. For the build. */
export function costume3dCheckConfig(): void {
    base();
    costume3dRegions();
}
