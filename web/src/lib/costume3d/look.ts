/**
 * What a role wears: the costumes of its `costume-role` document, its hairs and heads, and the
 * look of one `costume` document worn as it is or with a picked hair and head. Pure functions, no
 * fetching, so the rules can be tested on their own (scripts/test-costume3d.mjs).
 *
 * The document's looks are the game's combinations, worked out by the exporter: a look's models
 * are worn as they are. A picked hair or head is the role's own part, a part of another role (the
 * cross-role wardrobe), or — cross-role — the hair of the face the look shows.
 *
 * The rules for a picked bottom line follow the game's costume screen:
 * - a head with its own hair (`head_and_hair`) is its own face and replaces the hair;
 * - a picked head brings its default hair (`defaultHairs`), unless a hair was picked too;
 * - a head and a hair listed in `notAvailable` are not worn together: the head's default hair
 *   is worn instead.
 *
 * A picked hair or head not worn for one of these rules keeps the accessory as the look has it.
 *
 * Cross-role: a role may wear any role's costumes, hairs and heads. A costume the role has no look
 * of borrows the body of the role whose figure is nearest; another character's hair is worn on the
 * role's own face (the stage takes only the hair from that face). A head goes only with a hair
 * whose role can wear it in the game (and `notAvailable` still applies); another role's head
 * brings its default hair there. Heads with their own hair of other characters are left out: they
 * would bring that character's face.
 */
import type { Costume3dCatalog, Costume3dCostume, Costume3dPart, Costume3dPartModel, Costume3dRole, Costume3dVariant } from "@/types/costume3d";

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

/** What the stage shows of a look. */
export interface Costume3dLook {
    /** The body, with its colour-variation textures. */
    body: Costume3dPartModel;
    /** The face with its hair, or a head with its own hair. */
    face: string | null;
    /** A head with its own hair: it is the face, and no hair is worn. */
    fullHead: boolean;
    accessory: { model: Costume3dPartModel; attach: string | null } | null;
    /** The head worn (accessory or one with its own hair). */
    head: Costume3dPart | null;
    /** The hair worn; null under a head with its own hair. */
    hair: Costume3dPart | null;
    /** A picked hair that the head did not allow: what was picked. */
    hairReplaced: Costume3dPart | null;
    /** A picked hair that a head with its own hair hides. */
    hairIgnored: boolean;
    /** Cross-role: the costume's head, taken off for a picked hair it does not go with. */
    headDropped: Costume3dPart | null;
    /** Cross-role: another character's face whose hair is worn instead of the face's own. */
    hairFrom: string | null;
}

export function released(publishedAt: number | null, now: number): boolean {
    return publishedAt != null && publishedAt <= now;
}

/** The number of the costume a part belongs to; the default and unit costumes have none. */
export const costumeNumberOf = (part: Costume3dPart): number => part.costumeNumber ?? 0;
const colorNameOf = (part: Costume3dPart): string => part.colorName ?? "";
const nameOf = (part: Costume3dPart): string => part.name ?? "";

/**
 * The costumes a role can wear, newest first: its body parts grouped by costume number (0, the
 * role's starting outfit, is not a costume of its own). `publishedAt` is the earliest of the
 * colours'; colours are in id order.
 */
export function roleCostumes(catalog: Costume3dCatalog): RoleCostume[] {
    const byNumber = new Map<number, RoleCostume>();
    for (const part of catalog.parts) {
        const costumeNumber = costumeNumberOf(part);
        if (part.slot !== "body" || costumeNumber === 0 || !part.model) continue;
        let costume = byNumber.get(costumeNumber);
        if (!costume) {
            costume = { costumeNumber, name: nameOf(part), publishedAt: null, colors: [] };
            byNumber.set(costumeNumber, costume);
        }
        if (part.publishedAt != null && (costume.publishedAt == null || part.publishedAt < costume.publishedAt)) {
            costume.publishedAt = part.publishedAt;
        }
        if (!costume.colors.some(color => color.colorId === part.colorId)) {
            costume.colors.push({ colorId: part.colorId, colorName: colorNameOf(part) });
        }
    }
    const list = [...byNumber.values()];
    for (const costume of list) costume.colors.sort((a, b) => a.colorId - b.colorId);
    return list.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || b.costumeNumber - a.costumeNumber);
}

const newestFirst = (a: Costume3dPart, b: Costume3dPart) =>
    (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || costumeNumberOf(b) - costumeNumberOf(a);

/** The hairs a role can pick: its default first, then newest first. */
export function hairOptions(catalog: Costume3dCatalog): Costume3dPart[] {
    return catalog.parts
        .filter(part => part.slot === "hair" && part.model)
        .sort((a, b) => (costumeNumberOf(a) === 0 ? -1 : costumeNumberOf(b) === 0 ? 1 : newestFirst(a, b)));
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
 * The heads a role can pick, grouped by costume (an accessory and a head with its own hair of the
 * same costume are two groups), newest first.
 */
export function headGroups(catalog: Pick<Costume3dCatalog, "parts">): HeadGroup[] {
    const groups = new Map<string, HeadGroup>();
    for (const part of catalog.parts) {
        if (part.slot !== "head" || !part.model) continue;
        const costumeNumber = costumeNumberOf(part);
        const key = `${costumeNumber}:${part.headType ?? ""}`;
        let group = groups.get(key);
        if (!group) {
            group = { key, costumeNumber, name: nameOf(part), headType: part.headType, publishedAt: null, parts: [] };
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
/** The role: the name of its `costume-role` asset. */
const roleName = (role: { characterId: number; unit: string }) => `costume/role/${roleKey(role)}`;
/** A head and a hair by their models: the same accessory has an id per character. */
const modelPair = (head: Costume3dPart, hair: Costume3dPart) => `${head.model?.asset}|${head.model?.colors?.color ?? ""}|${hair.model?.asset}`;

/**
 * Whether `head` and `hair` are not worn together: by the role's `notAvailable`. With a pool, by
 * every role's, and also when the hair's role cannot wear the head in the game (no head of its
 * document has that model).
 */
export function blocked(catalog: Costume3dCatalog, head: Costume3dPart | null | undefined, hair: Costume3dPart | null | undefined, pool?: Costume3dPool | null): boolean {
    if (!head || !hair) return false;
    if (!pool) return catalog.notAvailable.some(([headId, hairId]) => headId === head.costume3dId && hairId === hair.costume3dId);
    if (!head.model || !hair.model) return false;
    if (pool.notAvailable.has(modelPair(head, hair))) return true;
    // The pool's parts are its own objects: one it does not hold is the role's own.
    const role = pool.roleOf.get(hair) ?? catalog.role;
    const heads = role && pool.roleHeads.get(roleKey(role));
    return Boolean(heads && !heads.has(head.model.asset));
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

/** The part of `variant` the role wears in one slot, when it has one. */
function wornPart(catalog: Costume3dCatalog, variant: Costume3dVariant, slot: Costume3dPart["slot"], pool?: Costume3dPool | null): Costume3dPart | null {
    const id = slot === "body" ? variant.body : slot === "head" ? variant.head : variant.hair;
    return partById(catalog, id, pool);
}

/** The accessory of `variant`, unless the look wears no head (0); its attach point is a child of the face's `Head` node. */
function accessoryOf(variant: Costume3dVariant): Costume3dLook["accessory"] {
    const model = variant.models.accessory;
    return model && variant.head !== 0 ? { model, attach: model.attach ?? null } : null;
}

/** A look whose body or face is not in the version is not shown (the specification requires it). */
export function showable(variant: Costume3dVariant): boolean {
    return !variant.missing?.length && Boolean(variant.models.body && variant.models.face);
}

/** The look of `variant` as the costume document gives it. */
export function defaultLook(variant: Costume3dVariant, catalog?: Costume3dCatalog | null, pool?: Costume3dPool | null): Costume3dLook {
    const head = catalog ? wornPart(catalog, variant, "head", pool) : pool?.headsById.get(variant.head) ?? null;
    const fullHead = head?.headType === "head_and_hair";
    return {
        body: variant.models.body as Costume3dPartModel,
        face: variant.models.face ?? null,
        fullHead,
        accessory: fullHead ? null : accessoryOf(variant),
        head: head?.model ? head : null,
        hair: fullHead || !catalog ? null : wornPart(catalog, variant, "hair", pool),
        hairReplaced: null,
        hairIgnored: false,
        headDropped: null,
        hairFrom: null,
    };
}

/**
 * The look of `variant` worn with `overrides`. With no `catalog` — or a pick that is not a part of
 * this role or of its pool — the look is the document's. With a `pool` (cross-role), parts of other
 * roles can be picked too.
 */
export function resolveLook(variant: Costume3dVariant, catalog: Costume3dCatalog | null | undefined, overrides: LookOverrides, pool?: Costume3dPool | null): Costume3dLook {
    const asGiven = defaultLook(variant, catalog, pool);
    if (!catalog || (overrides.head == null && overrides.hair == null)) return asGiven;
    const own = (part: Costume3dPart | null | undefined): part is Costume3dPart =>
        Boolean(part && (catalog.parts.includes(part) || pool?.roleOf.has(part)));
    // A head of 0 is a choice of none.
    const head = overrides.head ? partById(catalog, overrides.head, pool) : null;
    const pickedHead = own(head) ? head : null;
    const hair = hairById(catalog, overrides.hair, overrides.hairUnit, pool);
    const pickedHair = own(hair) ? hair : null;
    if (!pickedHead && !pickedHair && overrides.head !== 0) return asGiven;
    const look: Costume3dLook = { ...asGiven, hairReplaced: null, hairIgnored: false, hairFrom: null, headDropped: null };
    if (pickedHead?.headType === "head_and_hair" && pickedHead.model) {
        return { ...look, face: pickedHead.model.asset, accessory: null, head: pickedHead, hair: null, fullHead: true, hairIgnored: pickedHair != null };
    }
    // A head's default hair: the role's own, or (another role's head) that role's.
    const defaultHair = (part: Costume3dPart | null): Costume3dPart | null => (!part ? null
        : catalog.parts.includes(part) ? partById(catalog, catalog.defaultHairs[String(part.costume3dId)]) : pool?.defaultHairs.get(part) ?? null);
    // The costume's head, taken off when another role's hair is picked over it.
    const headDropped = overrides.head == null && pickedHair && !catalog.parts.includes(pickedHair) ? asGiven.head : null;
    // Following the costume: its head and hair, but not a look's own picks made over it.
    const wornHead = headDropped ? null
        : overrides.head === 0 ? null
        : overrides.head != null ? pickedHead
        : variant.head ? asGiven.head : null;
    const fallback = hairOptions(catalog)[0] ?? null;
    let wornHair = overrides.hair != null ? pickedHair
        : overrides.head == 0 ? fallback
        : (overrides.head != null ? defaultHair(wornHead) : null) ?? asGiven.hair ?? fallback;
    let worn = wornHead;
    // A hair the costume's own head does not allow leaves the head and the hair as the costume has them.
    if (wornHead && overrides.hair == null && blocked(catalog, wornHead, wornHair, pool)) wornHair = asGiven.hair ?? fallback;
    if (blocked(catalog, wornHead, wornHair, pool)) {
        // The head's default hair, else the first hair it allows; another role's head that no hair here goes with is not worn.
        look.hairReplaced = wornHair;
        wornHair = defaultHair(wornHead) ?? hairOptions(catalog).find(other => !blocked(catalog, wornHead, other, pool)) ?? fallback;
        if (blocked(catalog, wornHead, wornHair, pool)) {
            worn = null;
            look.hairReplaced = null;
        }
    }
    // Another character's hair goes on the role's own face, that of its default hair.
    const ownFace = !wornHair || catalog.parts.includes(wornHair)
        ? null
        : (partById(catalog, catalog.role.defaultHair) ?? hairOptions(catalog)[0])?.model?.asset ?? null;
    // The costume's accessory goes with its head, unless a pick takes the head off; another role's
    // head is worn without one (it may be on another character's face).
    const accessory = overrides.head === 0 || (overrides.head != null && !worn)
        ? null
        : variant.models.accessory ? { model: variant.models.accessory, attach: variant.models.accessory.attach ?? null } : null;
    return {
        ...look,
        face: ownFace ?? wornHair?.model?.asset ?? asGiven.face,
        hairFrom: ownFace && wornHair?.model ? wornHair.model.asset : null,
        accessory,
        head: worn?.model ? worn : null,
        hair: wornHair,
        fullHead: false,
        headDropped,
    };
}

/** What a pool knows of a role: its figure, by which a costume's body is borrowed, and its motions. */
export type PoolRole = Pick<Costume3dRole, "characterId" | "unit" | "figure" | "breastSize" | "motions">;

/** Every role's costumes, hairs and heads of one server, for the cross-role wardrobe. */
export interface Costume3dPool {
    roles: PoolRole[];
    /** Every costume a role has a look of, newest first. */
    costumes: RoleCostume[];
    /** Every hair, by character; one part per face bundle. */
    hairs: Costume3dPart[];
    /** Every head but the ones with their own hair, grouped as `headGroups` does; one part per costume, kind and colour. */
    heads: HeadGroup[];
    /** The heads above by costume3d id. */
    headsById: Map<number, Costume3dPart>;
    /** The role a hair or head above was taken from. */
    roleOf: Map<Costume3dPart, { characterId: number; unit: string }>;
    /** The character a costume (by number) was taken from. */
    costumeOwners: Map<number, number>;
    /** The characters with a look of a costume, and the genders of their figures (`mens` and `boys` are male). */
    costumeCharacters: Map<number, Set<number>>;
    costumeGenders: Map<number, Set<"female" | "male">>;
    /** Every role's `notAvailable`, by models (`modelPair`). */
    notAvailable: Set<string>;
    /** The head models each role can wear, by `characterId-unit`. */
    roleHeads: Map<string, Set<string>>;
    /** The hair a head above brings, from its role's `defaultHairs`. */
    defaultHairs: Map<Costume3dPart, Costume3dPart>;
}

/**
 * Builds a pool one document at a time, keeping only what the pool needs of each, so that the
 * documents (megabytes each) need not all be held at once.
 */
export class PoolBuilder {
    private readonly roles: PoolRole[] = [];
    private readonly costumes = new Map<number, RoleCostume>();
    private readonly hairs = new Map<string, Costume3dPart>();
    private readonly heads = new Map<string, Costume3dPart>();
    private readonly roleOf = new Map<Costume3dPart, { characterId: number; unit: string }>();
    private readonly costumeCharacters = new Map<number, Set<number>>();
    private readonly costumeGenders = new Map<number, Set<"female" | "male">>();
    private readonly notAvailable = new Set<string>();
    private readonly roleHeads = new Map<string, Set<string>>();
    /** A kept head's default hair, by face bundle. */
    private readonly headHairs = new Map<Costume3dPart, string>();

    add(catalog: Costume3dCatalog): void {
        const { characterId, unit, figure, breastSize, motions } = catalog.role;
        this.roles.push({ characterId, unit, figure, breastSize, motions });
        for (const costume of roleCostumes(catalog)) {
            const known = this.costumes.get(costume.costumeNumber);
            const add = <T,>(sets: Map<number, Set<T>>, value: T) => {
                const set = sets.get(costume.costumeNumber) ?? new Set<T>();
                sets.set(costume.costumeNumber, set.add(value));
            };
            add(this.costumeCharacters, characterId);
            add(this.costumeGenders, figure === "ladies" ? "female" : "male");
            if (!known) {
                this.costumes.set(costume.costumeNumber, { ...costume, colors: [...costume.colors] });
                continue;
            }
            if (costume.publishedAt != null && (known.publishedAt == null || costume.publishedAt < known.publishedAt)) known.publishedAt = costume.publishedAt;
            for (const color of costume.colors) if (!known.colors.some(other => other.colorId === color.colorId)) known.colors.push(color);
        }
        // Of parts that are the same, the lowest id is kept: documents arrive in any order, and
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
            if (part.slot === "hair") keep(this.hairs, part.model.asset, part);
            if (part.slot !== "head") continue;
            heads.add(part.model.asset);
            if (part.headType === "head_and_hair"
                || !keep(this.heads, `${costumeNumberOf(part)}:${part.headType ?? ""}:${part.colorId}`, part)) continue;
            const hairId = catalog.defaultHairs[String(part.costume3dId)];
            const hair = hairId ? catalog.parts.find(other => other.slot === "hair" && other.costume3dId === hairId)?.model : null;
            if (hair) this.headHairs.set(part, hair.asset);
        }
        // The ids of a rule are the document's own parts' where it applies to this role.
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
            owner(a) - owner(b) || (costumeNumberOf(a) === 0 ? -1 : costumeNumberOf(b) === 0 ? 1 : newestFirst(a, b)));
        const heads = headGroups({ parts: [...this.heads.values()] });
        const headsById = new Map([...this.heads.values()].map(part => [part.costume3dId, part]));
        const roles = [...this.roles].sort((a, b) => a.characterId - b.characterId || a.unit.localeCompare(b.unit));
        const defaultHairs = new Map<Costume3dPart, Costume3dPart>();
        for (const [head, asset] of this.headHairs) {
            const hair = this.hairs.get(asset);
            if (hair) defaultHairs.set(head, hair);
        }
        const costumeOwners = new Map([...this.costumeCharacters].map(([costumeNumber, characters]) => [costumeNumber, Math.min(...characters)]));
        return {
            roles, costumes, hairs, heads, headsById, roleOf: this.roleOf, costumeOwners,
            costumeCharacters: this.costumeCharacters, costumeGenders: this.costumeGenders,
            notAvailable: this.notAvailable, roleHeads: this.roleHeads, defaultHairs,
        };
    }
}

/** Whether a role of one of `characterIds` can wear `head` in the game. */
export function wearableBy(pool: Costume3dPool, head: Costume3dPart, characterIds: ReadonlySet<number>): boolean {
    const asset = head.model?.asset;
    return asset != null && pool.roles.some(role => characterIds.has(role.characterId) && Boolean(pool.roleHeads.get(roleKey(role))?.has(asset)));
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

/** A look borrowed from another role by the cross-role wardrobe, and the role it came from. */
export interface BorrowedVariant {
    variant: Costume3dVariant;
    from: { characterId: number; unit: string };
}

/**
 * The look of `costume` in `colorId` for the role of `catalog`: its own when it has one (as the
 * document gives it), else (cross-role) the body of the role whose figure is nearest — of the
 * colour's looks, else of the costume's — worn with the role's own face, default hair and motions,
 * and the costume's accessory when the role can wear it.
 */
export function costumeVariant(
    costume: Costume3dCostume, catalog: Costume3dCatalog, colorId: number, pool?: Costume3dPool | null,
): { variant: Costume3dVariant; from: { characterId: number; unit: string } | null } | null {
    const role = catalog.role;
    const own = costume.variants.find(entry => entry.role === roleName(role) || (entry.characterId === role.characterId && entry.unit === role.unit));
    if (own) return { variant: own, from: null };
    if (!pool) return null;
    const wearer: PoolRole = { ...role };
    const distance = (entry: Costume3dVariant) => {
        const of = pool.roles.find(other => other.characterId === entry.characterId && other.unit === entry.unit);
        return (of ? figureDistance(wearer, of) : 20) + (entry.characterId === role.characterId ? 0 : 0.5);
    };
    const donor = costume.variants
        .filter(showable)
        .sort((a, b) => (a.colorId !== colorId ? 1 : 0) - (b.colorId !== colorId ? 1 : 0) || distance(a) - distance(b) || a.characterId - b.characterId)[0];
    if (!donor?.models.body) return null;
    // The role's own hair on its own face; the costume's accessory only when the role can wear it there.
    const hair = partById(catalog, role.defaultHair) ?? hairOptions(catalog)[0] ?? null;
    if (!hair?.model) return null;
    const wearable = donor.models.accessory && pool.roleHeads.get(roleKey(role))?.has(donor.models.accessory.asset);
    const accessory = wearable
        ? [...pool.headsById.values()].find(part => part.model?.asset === donor.models.accessory?.asset
            && (part.model?.colors?.color ?? null) === (donor.models.accessory?.colors?.color ?? null))
        : undefined;
    return {
        variant: {
            role: roleName(role),
            characterId: role.characterId,
            unit: role.unit,
            colorId,
            body: donor.body,
            hair: hair.costume3dId,
            head: accessory?.costume3dId ?? 0,
            alternativeHeads: [],
            models: {
                body: donor.models.body,
                face: hair.model.asset,
                ...(accessory && donor.models.accessory ? { accessory: donor.models.accessory } : {}),
            },
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
    /** Another role's hair (cross-role): that role's unit. */
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





