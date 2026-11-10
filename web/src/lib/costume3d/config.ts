/**
 * Where the 3D costume pages read a published exporter output from: `NEXT_PUBLIC_COSTUME3D_BASE`
 * is the HTTP root of one output directory, below which `published/<region>/canonical/current.json`
 * points at each server's index and `store/<aa>/<sha256>.<ext>` holds its objects. The default is
 * the published output on assets.pjsk.moe.
 *
 * - `NEXT_PUBLIC_COSTUME3D_REGIONS`: the servers that have been published there, separated by
 *   commas (default `jp,cn`). A server left out has no 3D costumes.
 *
 * Values must already be canonical (what the URL parser gives back), https, or http on a
 * loopback host for development.
 */

/** The game servers a costume output can be published for. */
export const COSTUME3D_REGIONS = ["jp", "cn", "tw", "kr", "en"] as const;

export type Costume3dRegion = (typeof COSTUME3D_REGIONS)[number];

const DEFAULT_BASE = "https://assets.pjsk.moe/sekai-extra-assets/";
const DEFAULT_REGIONS = "jp,cn";

/**
 * The versions of the documents this reader understands, by `format`: the index documents
 * (publication), the costume documents (`costume.md`), clip documents and component documents.
 * Anything else is not read (as ADR-0013 of the former costume output had it), so a newer export
 * never renders wrongly here; it waits for this table to be updated with the reader.
 */
export const COSTUME3D_FORMATS: Readonly<Record<string, number>> = {
    pointer: 1,
    "index-root": 1,
    "index-shard": 1,
    listing: 1,
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
    "costume-model": 1,
    "costume-motion": 1,
    texture: 2,
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

/** The pointer of `region`'s output in the view that holds every asset (the default of a link), or null when that server has none. */
export function costume3dSource(region: string): string | null {
    if (!costume3dRegions().includes(region as Costume3dRegion)) return null;
    return `${base()}published/${region}/canonical/current.json`;
}

/** Checks every value the functions above read; a wrong one throws. For the build. */
export function costume3dCheckConfig(): void {
    base();
    costume3dRegions();
}
