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
 * stage takes only the hair from that face bundle); `notAvailable` no longer applies. Complete
 * heads of other characters are left out: they would bring that character's face.
 */
import type { Costume3dCatalog, Costume3dCostume, Costume3dPart, Costume3dRole, Costume3dVariant } from "@/types/costume3d";

/** A costume of one role: its colours and when it was first worn by this role. */
export interface RoleCostume {
    costumeNumber: number;
    name: string;
    publishedAt: number | null;
    colors: Array<{ colorId: number; colorName: string }>;
}

/** Hair and head picked over what the costume brings: null follows the costume, a head of 0 is none. */
export interface LookOverrides {
    hair: number | null;
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

export function blocked(catalog: Costume3dCatalog, headId: number | null | undefined, hairId: number | null | undefined, pool?: Costume3dPool | null): boolean {
    if (!headId || !hairId || pool) return false;
    return catalog.notAvailable.some(([head, hair]) => head === headId && hair === hairId);
}

function partById(catalog: Costume3dCatalog, id: number | null | undefined, pool?: Costume3dPool | null): Costume3dPart | null {
    if (!id) return null;
    return catalog.parts.find(part => part.costume3dId === id) ?? pool?.parts.get(id) ?? null;
}

/**
 * The bundles of `variant` worn with `overrides`. With a `pool` (unrestricted), parts of other
 * roles can be picked too, and `notAvailable` does not apply.
 */
export function resolveLook(variant: Costume3dVariant, catalog: Costume3dCatalog, overrides: LookOverrides, pool?: Costume3dPool | null): Costume3dLook {
    const look = { hairReplaced: null, hairIgnored: false, hairFrom: null };
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
    let hairId = overrides.hair ?? (overrides.head ? catalog.defaultHairs[String(overrides.head)] ?? variant.hair : variant.hair);
    let hairReplaced: Costume3dPart | null = null;
    if (blocked(catalog, headId, hairId, pool)) {
        hairReplaced = partById(catalog, hairId);
        hairId = catalog.defaultHairs[String(headId)]
            ?? hairOptions(catalog).find(hair => !blocked(catalog, headId, hair.costume3dId))?.costume3dId
            ?? hairId;
    }
    const hair = partById(catalog, hairId, pool) ?? hairOptions(catalog)[0] ?? null;
    // Another character's hair goes on the role's own face, that of its default hair.
    const own = !hair || catalog.parts.includes(hair);
    const ownFace = own ? null : (partById(catalog, catalog.role.defaultHair) ?? hairOptions(catalog)[0])?.model?.bundle ?? null;
    return {
        ...look,
        face: ownFace ?? hair?.model?.bundle ?? variant.faceBundle,
        hairFrom: ownFace && hair?.model ? hair.model.bundle : null,
        accessory: head?.model ? { bundle: head.model.bundle, color: head.model.color, attach: head.model.attach } : null,
        head: head?.model ? head : null,
        hair,
        fullHead: false,
        hairReplaced,
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
    /** The hairs and heads above by costume3d id. */
    parts: Map<number, Costume3dPart>;
    /** Which character a hair or head (by costume3d id), or a costume (by number), was taken from. */
    partOwners: Map<number, number>;
    costumeOwners: Map<number, number>;
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
    private readonly owners = new Map<number, number>();
    private readonly costumeOwners = new Map<number, number>();

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
        const keep = (parts: Map<string, Costume3dPart>, key: string, part: Costume3dPart) => {
            const known = parts.get(key);
            if (known && known.costume3dId <= part.costume3dId) return;
            if (known) this.owners.delete(known.costume3dId);
            parts.set(key, part);
            this.owners.set(part.costume3dId, characterId);
        };
        for (const part of catalog.parts) {
            if (!part.model) continue;
            if (part.slot === "hair") keep(this.hairs, part.model.bundle, part);
            else if (part.slot === "head" && part.headType !== "head_and_hair") keep(this.heads, `${part.costumeNumber}:${part.headType ?? ""}:${part.colorId}`, part);
        }
    }

    build(): Costume3dPool {
        const costumes = [...this.costumes.values()];
        for (const costume of costumes) costume.colors.sort((a, b) => a.colorId - b.colorId);
        costumes.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || b.costumeNumber - a.costumeNumber);
        const owner = (part: Costume3dPart) => this.owners.get(part.costume3dId) ?? 0;
        const hairs = [...this.hairs.values()].sort((a, b) =>
            owner(a) - owner(b) || (a.costumeNumber === 0 ? -1 : b.costumeNumber === 0 ? 1 : newestFirst(a, b)));
        const heads = headGroups({ parts: [...this.heads.values()] });
        const parts = new Map<number, Costume3dPart>();
        for (const part of [...hairs, ...this.heads.values()]) parts.set(part.costume3dId, part);
        const roles = [...this.roles].sort((a, b) => a.characterId - b.characterId || a.unit.localeCompare(b.unit));
        return { roles, costumes, hairs, heads, parts, partOwners: this.owners, costumeOwners: this.costumeOwners };
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
 * default hair and motion, and the costume's head when that is an accessory. `from` names the
 * role the body was borrowed from.
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
    // The donor's head id is its role's: the pool's part of the same accessory stands for it.
    const accessory = donor.accessoryBundle
        ? [...pool.parts.values()].find(part => part.slot === "head" && part.model?.bundle === donor.accessoryBundle && part.model?.color === (donor.accessoryColor ?? null))
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
            accessoryBundle: donor.accessoryBundle ?? null,
            accessoryColor: donor.accessoryColor ?? null,
            attach: donor.attach ?? null,
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
    head: number | null;
}

/** Address parameters: `server`, `ch`, `u`, `c`, `col`, `hair`, `head`. */
export function parseSelection(params: URLSearchParams): Partial<Costume3dSelection> & { server?: string } {
    const id = (name: string, min: number): number | undefined => {
        const raw = params.get(name);
        if (raw == null || !/^\d+$/.test(raw)) return undefined;
        const value = Number(raw);
        return Number.isSafeInteger(value) && value >= min ? value : undefined;
    };
    const unit = params.get("u");
    const server = params.get("server")?.trim().toLowerCase();
    return {
        ...(server ? { server } : {}),
        ...(id("ch", 1) != null ? { characterId: id("ch", 1) } : {}),
        ...(unit && /^[a-z_]+$/.test(unit) ? { unit } : {}),
        ...(id("c", 1) != null ? { costumeNumber: id("c", 1) } : {}),
        ...(id("col", 1) != null ? { colorId: id("col", 1) } : {}),
        ...(id("hair", 1) != null ? { hair: id("hair", 1) } : {}),
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
