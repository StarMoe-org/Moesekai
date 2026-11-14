/**
 * Catalogues of a published output: the roles it lists, a role's document, and the cross-role
 * wardrobe of every role's document. The documents stay in the publication's cache; the wardrobe
 * is built one role at a time, so that no more of them need be held at once than the cache keeps.
 */
import type { Costume3dCatalog } from "@/types/costume3d";
import { Costume3dDocumentError, openOutput, type Costume3dPublication } from "./publication";
import { PoolBuilder, type Costume3dPool } from "./look";

const ROLE_PREFIX = "costume/role/";

/** The roles the output lists: a character in a unit, by the name of its `costume-role` asset. */
export async function openOutputRoles(region: string): Promise<{ publication: Costume3dPublication; roles: Costume3dCatalog["role"][] }> {
    const publication = await openOutput(region);
    const roles = (await publication.listing("costume-role")).map(parseRoleName).filter((role): role is Costume3dCatalog["role"] => role !== null);
    return { publication, roles };
}

/** `costume/role/<characterId>-<unit>` as its character and unit. */
function parseRoleName(name: string): { characterId: number; unit: string } | null {
    const match = name.startsWith(ROLE_PREFIX) ? /^(\d+)-([a-z_]+)$/.exec(name.slice(ROLE_PREFIX.length)) : null;
    return match ? { characterId: Number(match[1]), unit: match[2] } : null;
}

const roleName = (role: { characterId: number; unit: string }): string => `${ROLE_PREFIX}${role.characterId}-${role.unit}`;

/** A role's document; one that is not published is read again on the next attempt. */
export function loadCatalog(output: Costume3dPublication, role: { characterId: number; unit: string }): Promise<Costume3dCatalog> {
    return output.role(roleName(role));
}

/** Catalogs read at once while a pool is built. */
const POOL_CONCURRENCY = 8;
const pools = new Map<string, Promise<Costume3dPool>>();

/** Every role's document reduced to a pool (unrestricted wardrobe). */
export function loadPool(output: Costume3dPublication, roles: Costume3dCatalog["role"][]): Promise<Costume3dPool> {
    let pending = pools.get(output.pointer);
    if (!pending) {
        pending = (async () => {
            const builder = new PoolBuilder();
            const queue = [...roles];
            const worker = async () => {
                for (let entry = queue.shift(); entry; entry = queue.shift()) {
                    try {
                        builder.add(await loadCatalog(output, entry));
                    } catch (error) {
                        // A document this reader cannot read ends the pool; one that was not published is left out.
                        if (!(error instanceof Costume3dDocumentError && error.reason === "missing")) throw error;
                    }
                }
            };
            await Promise.all(Array.from({ length: POOL_CONCURRENCY }, worker));
            return builder.build();
        })();
        pending.catch(() => pools.delete(output.pointer));
        pools.set(output.pointer, pending);
    }
    return pending;
}

