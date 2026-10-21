/**
 * Reading a server's costume output: its version (checked before anything else is read), its
 * roles, a role's catalog and a costume's looks. Documents are kept for the page's lifetime;
 * a failed request is forgotten so that a retry asks again.
 */
import type { Costume3dCatalog, Costume3dCostume, Costume3dRoleList, Costume3dVersion } from "@/types/costume3d";
import { COSTUME3D_FORMATS, costume3dSource } from "./config";

/** Why an output cannot be read: not published for the server, written in formats this reader does not know, or not reachable. */
export class Costume3dUnavailableError extends Error {
    constructor(readonly reason: "region" | "format" | "network", detail?: string) {
        super(`costume3d_unavailable:${reason}${detail ? `:${detail}` : ""}`);
    }
}

const documents = new Map<string, Promise<unknown>>();

function fetchJson<T>(url: string): Promise<T> {
    let pending = documents.get(url) as Promise<T> | undefined;
    if (!pending) {
        pending = fetch(url).then(response => {
            if (!response.ok) throw new Error(`${response.status} ${url}`);
            return response.json() as Promise<T>;
        });
        pending.catch(() => documents.delete(url));
        documents.set(url, pending);
    }
    return pending;
}

export interface Costume3dOutput {
    region: string;
    /** The output's directory, ending in `/`. */
    source: string;
    /** `library/` of the output: parts are `<library><bundle>/`. */
    library: string;
    version: Costume3dVersion;
    roles: Costume3dRoleList["roles"];
}

/** Opens `region`'s output, after checking that it is written in the formats this reader knows. */
export async function openOutput(region: string): Promise<Costume3dOutput> {
    const source = costume3dSource(region);
    if (!source) throw new Costume3dUnavailableError("region");
    let version: Costume3dVersion;
    let roles: Costume3dRoleList;
    try {
        [version, roles] = await Promise.all([
            fetchJson<Costume3dVersion>(`${source}index/version.json`),
            fetchJson<Costume3dRoleList>(`${source}index/roles.json`),
        ]);
    } catch (error) {
        throw new Costume3dUnavailableError("network", error instanceof Error ? error.message : String(error));
    }
    const expected = Object.entries(COSTUME3D_FORMATS);
    const formats = version.formats ?? {};
    const mismatch = Object.keys(formats).length !== expected.length
        || expected.some(([name, number]) => formats[name] !== number);
    if (version.format !== "costume3d-version" || mismatch) {
        throw new Costume3dUnavailableError("format", JSON.stringify(formats));
    }
    return { region, source, library: `${source}library/`, version, roles: roles.roles };
}

export function loadCatalog(output: Costume3dOutput, role: { characterId: number; unit: string }): Promise<Costume3dCatalog> {
    const entry = output.roles.find(r => r.characterId === role.characterId && r.unit === role.unit);
    if (!entry) return Promise.reject(new Error(`no role ${role.characterId}-${role.unit}`));
    return fetchJson<Costume3dCatalog>(`${output.source}${entry.catalog}`);
}

export function loadCostume(output: Costume3dOutput, costumeNumber: number): Promise<Costume3dCostume> {
    return fetchJson<Costume3dCostume>(`${output.source}index/costumes/${costumeNumber}.json`);
}

/** Loads a JSON file below `library/` (part records and motions), kept like the indexes. */
export function loadLibraryJson<T>(library: string, path: string): Promise<T> {
    return fetchJson<T>(`${library}${path}`);
}
