/**
 * What a role wears, worked out from the costume output's indexes: the costumes a role can
 * pick, its hairs and heads, and the bundles of one look. Pure functions, no fetching, so the
 * rules can be tested on their own (scripts/test-costume3d.mjs).
 *
 * The rules follow the game's costume screen:
 * - a complete head (`head_and_hair`) is its own face bundle and replaces the hair;
 * - a picked head brings its default hair (`defaultHairs`), unless a hair was picked too;
 * - a head and a hair listed in `notAvailable` are not worn together: the head's default hair
 *   is worn instead.
 *
 * Unrestricted (an experimental setting): a role may wear any role's costumes, hairs and heads,
 * from a pool of every role's catalog. A costume the role has no look of borrows the body of the
 * role whose figure is nearest; another character's hair is worn on the role's own face (the
 * stage takes only the hair from that face bundle). A head goes only with a hair whose role can
 * wear it in the game (and `notAvailable`, by the costume3d ids every catalog shares, still
 * applies); another role's head brings its default hair there. Complete heads of other
 * characters are left out: they would bring that character's face.
 */
import type { Costume3dCatalog, Costume3dCostume, Costume3dPart, Costume3dRole, Costume3dVariant } from "@/types/costume3d";

/** A costume of one role: its colours and when it was first worn by this role. */
export interface RoleCostume {
    costumeNumber: number;
    name: string;
    publishedAt: number | null;
    colors: Array<{ colorId: number; colorName: string }>;
}

/**
 * Hair and head picked over what the costume brings: null follows the costume, a head of 0 is
 * none. Ids are a character's, shared by its roles (Miku's units): another role's hair is named
 * by its id and that role's unit.
 */
export interface LookOverrides {
    hair: number | null;
    hairUnit?: string | null;
    head: number | null;
}

export interface Costume3dLook {
    /** The face bundle: face and hair, or a complete head. */
    face: string;
    accessory: { bundle: string; color: string | null; attach: string | null } | null;
    /** The head worn (accessory or complete head), if any. */
    head: Costume3dPart | null;
    /** The hair worn; null under a complete head. */
    hair: Costume3dPart | null;
    fullHead: boolean;
    /** A picked hair that the head did not allow: what was picked. */
    hairReplaced: Costume3dPart | null;
    /** A picked hair that a complete head hides. */
    hairIgnored: boolean;
    /** Unrestricted: the costume's head, taken off for a picked hair it does not go with. */
    headDropped: Costume3dPart | null;
    /** Unrestricted: another character's face bundle whose hair is worn instead of the face's own. */
    hairFrom: string | null;
}

export function released(publishedAt: number | null, now: number): boolean {
    return publishedAt != null && publishedAt <= now;
}

/**
 * The costumes a role can wear, newest first: its body parts grouped by costume number (0, the
 * role's starting outfit, is not a costume of its own). `publishedAt` is the earliest of the
 * colours'; colours are in id order.
 */
export function roleCostumes(catalog: Costume3dCatalog): RoleCostume[] {
    const byNumber = new Map<number, RoleCostume>();
    for (const part of catalog.parts) {
        if (part.slot !== "body" || part.costumeNumber === 0 || !part.model) continue;
        let costume = byNumber.get(part.costumeNumber);
        if (!costume) {
            costume = { costumeNumber: part.costumeNumber, name: part.name, publishedAt: null, colors: [] };
            byNumber.set(part.costumeNumber, costume);
        }
        if (part.publishedAt != null && (costume.publishedAt == null || part.publishedAt < costume.publishedAt)) {
            costume.publishedAt = part.publishedAt;
        }
        if (!costume.colors.some(color => color.colorId === part.colorId)) {
            costume.colors.push({ colorId: part.colorId, colorName: part.colorName });
        }
    }
    const list = [...byNumber.values()];
    for (const costume of list) costume.colors.sort((a, b) => a.colorId - b.colorId);
    return list.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || b.costumeNumber - a.costumeNumber);
}

const newestFirst = (a: Costume3dPart, b: Costume3dPart) =>
    (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || b.costumeNumber - a.costumeNumber;

/** The hairs a role can pick: its default first, then newest first. */
export function hairOptions(catalog: Costume3dCatalog): Costume3dPart[] {
    return catalog.parts
        .filter(part => part.slot === "hair" && part.model)
        .sort((a, b) => (a.costumeNumber === 0 ? -1 : b.costumeNumber === 0 ? 1 : newestFirst(a, b)));
}

/** The heads of one costume, as a wardrobe shows them: one card, a swatch per colour. */
export interface HeadGroup {
    key: string;
    costumeNumber: number;
    name: string;
    headType: Costume3dPart["headType"];
    publishedAt: number | null;
    /** One part per colour, in colour order. */
    parts: Costume3dPart[];
}

/**
 * The heads a role can pick, grouped by costume (an accessory and a complete head of the same
 * costume are two groups), newest first.
 */
export function headGroups(catalog: Pick<Costume3dCatalog, "parts">): HeadGroup[] {
    const groups = new Map<string, HeadGroup>();
    for (const part of catalog.parts) {
        if (part.slot !== "head" || !part.model) continue;
        const key = `${part.costumeNumber}:${part.headType ?? ""}`;
        let group = groups.get(key);
        if (!group) {
            group = { key, costumeNumber: part.costumeNumber, name: part.name, headType: part.headType, publishedAt: null, parts: [] };
            groups.set(key, group);
        }
        if (part.publishedAt != null && (group.publishedAt == null || part.publishedAt < group.publishedAt)) group.publishedAt = part.publishedAt;
        if (!group.parts.some(other => other.colorId === part.colorId)) group.parts.push(part);
    }
    const list = [...groups.values()];
    for (const group of list) group.parts.sort((a, b) => a.colorId - b.colorId);
    return list.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || b.costumeNumber - a.costumeNumber);
}

const roleKey = (role: { characterId: number; unit: string }) => `${role.characterId}-${role.unit}`;
/** A head and a hair by their models: the same accessory has an id per character. */
const modelPair = (head: Costume3dPart, hair: Costume3dPart) => `${head.model?.bundle}|${head.model?.color ?? ""}|${hair.model?.bundle}`;

/**
 * Whether `head` and `hair` are not worn together: by the role's `notAvailable`. With a pool, by
 * every role's, and also when the hair's role cannot wear the head in the game (no head of its
 * catalog has that model).
 */
export function blocked(catalog: Costume3dCatalog, head: Costume3dPart | null | undefined, hair: Costume3dPart | null | undefined, pool?: Costume3dPool | null): boolean {
    if (!head || !hair) return false;
    if (!pool) return catalog.notAvailable.some(([headId, hairId]) => headId === head.costume3dId && hairId === hair.costume3dId);
    if (!head.model || !hair.model) return false;
    if (pool.notAvailable.has(modelPair(head, hair))) return true;
    // The pool's parts are its own objects: one it does not hold is the role's own.
    const role = pool.roleOf.get(hair) ?? catalog.role;
    const heads = role && pool.roleHeads.get(roleKey(role));
    return Boolean(heads && !heads.has(head.model.bundle));
}

function partById(catalog: Costume3dCatalog, id: number | null | undefined, pool?: Costume3dPool | null): Costume3dPart | null {
    if (!id) return null;
    return catalog.parts.find(part => part.costume3dId === id) ?? pool?.headsById.get(id) ?? null;
}

/** A hair by id: the role's own, or (with a pool) that of the role of `unit`, else of any role. */
export function hairById(catalog: Costume3dCatalog, id: number | null | undefined, unit?: string | null, pool?: Costume3dPool | null): Costume3dPart | null {
    if (!id) return null;
    const own = !unit || unit === catalog.role.unit
        ? catalog.parts.find(part => part.slot === "hair" && part.costume3dId === id)
        : undefined;
    return own ?? pool?.hairs.find(part => part.costume3dId === id && (!unit || pool.roleOf.get(part)?.unit === unit)) ?? null;
}

/**
 * The bundles of `variant` worn with `overrides`. With a `pool` (unrestricted), parts of other
 * roles can be picked too.
 */
export function resolveLook(variant: Costume3dVariant, catalog: Costume3dCatalog, overrides: LookOverrides, pool?: Costume3dPool | null): Costume3dLook {
    const look = { hairReplaced: null, hairIgnored: false, hairFrom: null, headDropped: null };
    if (overrides.head == null && overrides.hair == null) {
        const own = partById(catalog, variant.head, pool);
        const fullHead = own?.headType === "head_and_hair";
        return {
            ...look,
            face: variant.faceBundle,
            accessory: variant.accessoryBundle
                ? { bundle: variant.accessoryBundle, color: variant.accessoryColor ?? null, attach: variant.attach ?? null }
                : null,
            head: own?.model ? own : null,
            hair: fullHead ? null : partById(catalog, variant.hair),
            fullHead,
        };
    }
    const headId = overrides.head ?? variant.head;
    const head = partById(catalog, headId, pool);
    if (head?.headType === "head_and_hair" && head.model) {
        return { ...look, face: head.model.bundle, accessory: null, head, hair: null, fullHead: true, hairIgnored: overrides.hair != null };
    }
    // A head's default hair: the role's own, or (another role's head) that role's.
    const defaultHair = (part: Costume3dPart | null) => (!part ? null
        : catalog.parts.includes(part) ? partById(catalog, catalog.defaultHairs[String(part.costume3dId)]) : pool?.defaultHairs.get(part) ?? null);
    let hair = overrides.hair != null
        ? hairById(catalog, overrides.hair, overrides.hairUnit, pool)
        : (overrides.head ? defaultHair(head) : null) ?? partById(catalog, variant.hair);
    hair = hair ?? hairOptions(catalog)[0] ?? null;
    let hairReplaced: Costume3dPart | null = null;
    let worn = head;
    let headDropped: Costume3dPart | null = null;
    if (blocked(catalog, head, hair, pool)) {
        if (pool && overrides.hair != null && overrides.head == null) {
            // A picked hair over the costume's head: the head comes off.
            worn = null;
            headDropped = head;
        } else {
            hairReplaced = hair;
            hair = defaultHair(head) ?? hairOptions(catalog).find(other => !blocked(catalog, head, other, pool)) ?? hair;
            // Another role's head that no hair here goes with: not worn.
            if (pool && blocked(catalog, head, hair, pool)) [worn, hairReplaced] = [null, null];
        }
    }
    // Another character's hair goes on the role's own face, that of its default hair.
    const own = !hair || catalog.parts.includes(hair);
    const ownFace = own ? null : (partById(catalog, catalog.role.defaultHair) ?? hairOptions(catalog)[0])?.model?.bundle ?? null;
    return {
        ...look,
        face: ownFace ?? hair?.model?.bundle ?? variant.faceBundle,
        hairFrom: ownFace && hair?.model ? hair.model.bundle : null,
        accessory: worn?.model ? { bundle: worn.model.bundle, color: worn.model.color, attach: worn.model.attach } : null,
        head: worn?.model ? worn : null,
        hair,
        fullHead: false,
        hairReplaced,
        headDropped,
    };
}

/** What a pool knows of a role: its figure, by which a costume's body is borrowed. */
export type PoolRole = Pick<Costume3dRole, "characterId" | "unit" | "figure" | "breastSize">;

/** Every role's costumes, hairs and heads of one server, for the unrestricted wardrobe. */
export interface Costume3dPool {
    roles: PoolRole[];
    /** Every costume a role has a look of, newest first. */
    costumes: RoleCostume[];
    /** Every hair, by character; one part per face bundle. */
    hairs: Costume3dPart[];
    /** Every head but the complete ones, grouped as `headGroups` does; one part per costume, kind and colour. */
    heads: HeadGroup[];
    /** The heads above by costume3d id. */
    headsById: Map<number, Costume3dPart>;
    /** The role a hair or head above was taken from. */
    roleOf: Map<Costume3dPart, { characterId: number; unit: string }>;
    /** The character a costume (by number) was taken from. */
    costumeOwners: Map<number, number>;
    /** Every role's `notAvailable`, by models (`modelPair`). */
    notAvailable: Set<string>;
    /** The head models each role can wear, by `characterId-unit`. */
    roleHeads: Map<string, Set<string>>;
    /** The hair a head above brings, from its role's `defaultHairs`. */
    defaultHairs: Map<Costume3dPart, Costume3dPart>;
}

/**
 * Builds a pool one catalog at a time, keeping only what the pool needs of each, so that the
 * catalogs (megabytes each) need not all be held at once.
 */
export class PoolBuilder {
    private readonly roles: PoolRole[] = [];
    private readonly costumes = new Map<number, RoleCostume>();
    private readonly hairs = new Map<string, Costume3dPart>();
    private readonly heads = new Map<string, Costume3dPart>();
    private readonly roleOf = new Map<Costume3dPart, { characterId: number; unit: string }>();
    private readonly costumeOwners = new Map<number, number>();
    private readonly notAvailable = new Set<string>();
    private readonly roleHeads = new Map<string, Set<string>>();
    /** A kept head's default hair, by face bundle. */
    private readonly headHairs = new Map<Costume3dPart, string>();

    add(catalog: Costume3dCatalog): void {
        const { characterId, unit, figure, breastSize } = catalog.role;
        this.roles.push({ characterId, unit, figure, breastSize });
        for (const costume of roleCostumes(catalog)) {
            const known = this.costumes.get(costume.costumeNumber);
            if (characterId < (this.costumeOwners.get(costume.costumeNumber) ?? Infinity)) this.costumeOwners.set(costume.costumeNumber, characterId);
            if (!known) {
                this.costumes.set(costume.costumeNumber, { ...costume, colors: [...costume.colors] });
                continue;
            }
            if (costume.publishedAt != null && (known.publishedAt == null || costume.publishedAt < known.publishedAt)) known.publishedAt = costume.publishedAt;
            for (const color of costume.colors) if (!known.colors.some(other => other.colorId === color.colorId)) known.colors.push(color);
        }
        // Of parts that are the same, the lowest id is kept: catalogs arrive in any order, and
        // the address names parts by id.
        const keep = (parts: Map<string, Costume3dPart>, key: string, part: Costume3dPart): boolean => {
            const known = parts.get(key);
            if (known && known.costume3dId <= part.costume3dId) return false;
            if (known) {
                this.roleOf.delete(known);
                this.headHairs.delete(known);
            }
            parts.set(key, part);
            this.roleOf.set(part, { characterId, unit });
            return true;
        };
        const heads = new Set<string>();
        this.roleHeads.set(roleKey(catalog.role), heads);
        const byId = new Map<number, Costume3dPart>();
        for (const part of catalog.parts) {
            if (!part.model) continue;
            if (part.slot !== "body") byId.set(part.costume3dId, part);
            if (part.slot === "hair") keep(this.hairs, part.model.bundle, part);
            if (part.slot !== "head") continue;
            heads.add(part.model.bundle);
            if (part.headType === "head_and_hair" || !keep(this.heads, `${part.costumeNumber}:${part.headType ?? ""}:${part.colorId}`, part)) continue;
            const hairId = catalog.defaultHairs[String(part.costume3dId)];
            const hair = hairId ? catalog.parts.find(other => other.slot === "hair" && other.costume3dId === hairId)?.model : null;
            if (hair) this.headHairs.set(part, hair.bundle);
        }
        // The ids of a rule are the catalog's own parts' where it applies to this role.
        for (const [headId, hairId] of catalog.notAvailable) {
            const head = byId.get(headId);
            const hair = byId.get(hairId);
            if (head && hair) this.notAvailable.add(modelPair(head, hair));
        }
    }

    build(): Costume3dPool {
        const costumes = [...this.costumes.values()];
        for (const costume of costumes) costume.colors.sort((a, b) => a.colorId - b.colorId);
        costumes.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || b.costumeNumber - a.costumeNumber);
        const owner = (part: Costume3dPart) => this.roleOf.get(part)?.characterId ?? 0;
        const hairs = [...this.hairs.values()].sort((a, b) =>
            owner(a) - owner(b) || (a.costumeNumber === 0 ? -1 : b.costumeNumber === 0 ? 1 : newestFirst(a, b)));
        const heads = headGroups({ parts: [...this.heads.values()] });
        const headsById = new Map([...this.heads.values()].map(part => [part.costume3dId, part]));
        const roles = [...this.roles].sort((a, b) => a.characterId - b.characterId || a.unit.localeCompare(b.unit));
        const defaultHairs = new Map<Costume3dPart, Costume3dPart>();
        for (const [head, bundle] of this.headHairs) {
            const hair = this.hairs.get(bundle);
            if (hair) defaultHairs.set(head, hair);
        }
        return {
            roles, costumes, hairs, heads, headsById, roleOf: this.roleOf, costumeOwners: this.costumeOwners,
            notAvailable: this.notAvailable, roleHeads: this.roleHeads, defaultHairs,
        };
    }
}

const BREAST_SIZES = ["ss", "s", "m", "l"];

/**
 * How far figure `b` is from the wearer's `a`: the same figure nearest, by bust for ladies; then
 * the other figure of the same gender; the other gender last, the flattest ladies' first.
 */
function figureDistance(a: PoolRole, b: PoolRole): number {
    const bust = (role: PoolRole) => BREAST_SIZES.indexOf(role.breastSize);
    if (a.figure === b.figure) return a.figure === "ladies" ? Math.abs(bust(a) - bust(b)) : 0;
    if ((a.figure === "ladies") === (b.figure === "ladies")) return 5;
    return 10 + (b.figure === "ladies" ? bust(b) : 0);
}

/**
 * The look of `costume` in `colorId` for the role of `catalog`: its own when it has one, else
 * (unrestricted) the body of the role whose figure is nearest, worn with the role's own face,
 * default hair and motion, and the costume's accessory when the role can wear it. `from` names
 * the role the body was borrowed from.
 */
export function costumeVariant(
    costume: Costume3dCostume, catalog: Costume3dCatalog, colorId: number, pool?: Costume3dPool | null,
): { variant: Costume3dVariant; from: { characterId: number; unit: string } | null } | null {
    const role = catalog.role;
    const own = costume.variants.find(entry => entry.characterId === role.characterId && entry.unit === role.unit && entry.colorId === colorId);
    if (own || !pool) return own ? { variant: own, from: null } : null;
    const wearer = { characterId: role.characterId, unit: role.unit, figure: role.figure, breastSize: role.breastSize };
    const distance = (entry: Costume3dVariant) => {
        const of = pool.roles.find(other => other.characterId === entry.characterId && other.unit === entry.unit);
        return (of ? figureDistance(wearer, of) : 20) + (entry.characterId === role.characterId ? 0 : 0.5);
    };
    const donor = costume.variants
        .filter(entry => entry.colorId === colorId && entry.bodyBundle && !entry.missing?.length)
        .sort((a, b) => distance(a) - distance(b) || a.characterId - b.characterId)[0];
    if (!donor) return null;
    const hair = partById(catalog, role.defaultHair) ?? hairOptions(catalog)[0] ?? null;
    if (!hair?.model) return null;
    // The costume's accessory, when the role can wear it with its own hair; the pool's part of it
    // stands for the donor's head.
    const wearable = donor.accessoryBundle && pool.roleHeads.get(roleKey(role))?.has(donor.accessoryBundle);
    const accessory = wearable
        ? [...pool.headsById.values()].find(part => part.model?.bundle === donor.accessoryBundle && part.model?.color === (donor.accessoryColor ?? null))
        : undefined;
    return {
        variant: {
            characterId: role.characterId,
            unit: role.unit,
            colorId,
            body: donor.body,
            hair: hair.costume3dId,
            head: accessory?.costume3dId ?? 0,
            bodyBundle: donor.bodyBundle,
            bodyColor: donor.bodyColor,
            faceBundle: hair.model.bundle,
            accessoryBundle: accessory ? donor.accessoryBundle : null,
            accessoryColor: accessory ? donor.accessoryColor ?? null : null,
            attach: accessory ? donor.attach ?? null : null,
            motion: role.motion,
        },
        from: { characterId: donor.characterId, unit: donor.unit },
    };
}

/** What the page shows, as the address keeps it. */
export interface Costume3dSelection {
    characterId: number;
    unit: string;
    costumeNumber: number;
    colorId: number;
    hair: number | null;
    /** Another role's hair (unrestricted): that role's unit. */
    hairUnit: string | null;
    head: number | null;
}

/** Address parameters: `server`, `ch`, `u`, `c`, `col`, `hair`, `hu`, `head`. */
export function parseSelection(params: URLSearchParams): Partial<Costume3dSelection> & { server?: string } {
    const id = (name: string, min: number): number | undefined => {
        const raw = params.get(name);
        if (raw == null || !/^\d+$/.test(raw)) return undefined;
        const value = Number(raw);
        return Number.isSafeInteger(value) && value >= min ? value : undefined;
    };
    const unit = params.get("u");
    const hairUnit = params.get("hu");
    const server = params.get("server")?.trim().toLowerCase();
    return {
        ...(server ? { server } : {}),
        ...(id("ch", 1) != null ? { characterId: id("ch", 1) } : {}),
        ...(unit && /^[a-z_]+$/.test(unit) ? { unit } : {}),
        ...(id("c", 1) != null ? { costumeNumber: id("c", 1) } : {}),
        ...(id("col", 1) != null ? { colorId: id("col", 1) } : {}),
        ...(id("hair", 1) != null ? { hair: id("hair", 1) } : {}),
        ...(hairUnit && /^[a-z_]+$/.test(hairUnit) ? { hairUnit } : {}),
        ...(id("head", 0) != null ? { head: id("head", 0) } : {}),
    };
}

/** The address parameters of a selection; `server` only when it is not the site's. */
export function selectionParams(selection: Costume3dSelection, server: string | null): URLSearchParams {
    const params = new URLSearchParams();
    if (server) params.set("server", server);
    params.set("ch", String(selection.characterId));
    params.set("u", selection.unit);
    params.set("c", String(selection.costumeNumber));
    params.set("col", String(selection.colorId));
    if (selection.hair != null) params.set("hair", String(selection.hair));
    if (selection.hair != null && selection.hairUnit) params.set("hu", selection.hairUnit);
    if (selection.head != null) params.set("head", String(selection.head));
    return params;
}

/** A link to the 3D costume page; what is left out the page chooses. */
export function costume3dHref(target: { characterId?: number; unit?: string; costumeNumber?: number; colorId?: number }): string {
    const params = new URLSearchParams();
    if (target.characterId) params.set("ch", String(target.characterId));
    if (target.unit) params.set("u", target.unit);
    if (target.costumeNumber) params.set("c", String(target.costumeNumber));
    if (target.colorId) params.set("col", String(target.colorId));
    const query = params.toString();
    return query ? `/costume-3d?${query}` : "/costume-3d";
}
