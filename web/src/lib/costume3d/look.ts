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
 */
import type { Costume3dCatalog, Costume3dPart, Costume3dVariant } from "@/types/costume3d";

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
}

/** A part's model and colour: parts of different costumes that look the same share it. */
export function modelKey(part: Costume3dPart | null | undefined): string {
    return part?.model ? `${part.model.bundle}|${part.model.color ?? ""}` : "none";
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

/** The heads a role can pick, newest first, each model and colour once (many costumes share one). */
export function headOptions(catalog: Costume3dCatalog): Costume3dPart[] {
    const seen = new Set<string>();
    return catalog.parts
        .filter(part => part.slot === "head" && part.model)
        .sort(newestFirst)
        .filter(part => {
            const key = modelKey(part);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

export function blocked(catalog: Costume3dCatalog, headId: number | null | undefined, hairId: number | null | undefined): boolean {
    if (!headId || !hairId) return false;
    return catalog.notAvailable.some(([head, hair]) => head === headId && hair === hairId);
}

function partById(catalog: Costume3dCatalog, id: number | null | undefined): Costume3dPart | null {
    if (!id) return null;
    return catalog.parts.find(part => part.costume3dId === id) ?? null;
}

/** The bundles of `variant` worn with `overrides`. */
export function resolveLook(variant: Costume3dVariant, catalog: Costume3dCatalog, overrides: LookOverrides): Costume3dLook {
    const look = { hairReplaced: null, hairIgnored: false };
    if (overrides.head == null && overrides.hair == null) {
        const own = partById(catalog, variant.head);
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
    const head = partById(catalog, headId);
    if (head?.headType === "head_and_hair" && head.model) {
        return { ...look, face: head.model.bundle, accessory: null, head, hair: null, fullHead: true, hairIgnored: overrides.hair != null };
    }
    let hairId = overrides.hair ?? (overrides.head ? catalog.defaultHairs[String(overrides.head)] ?? variant.hair : variant.hair);
    let hairReplaced: Costume3dPart | null = null;
    if (blocked(catalog, headId, hairId)) {
        hairReplaced = partById(catalog, hairId);
        hairId = catalog.defaultHairs[String(headId)]
            ?? hairOptions(catalog).find(hair => !blocked(catalog, headId, hair.costume3dId))?.costume3dId
            ?? hairId;
    }
    const hair = partById(catalog, hairId) ?? hairOptions(catalog)[0] ?? null;
    return {
        ...look,
        face: hair?.model?.bundle ?? variant.faceBundle,
        accessory: head?.model ? { bundle: head.model.bundle, color: head.model.color, attach: head.model.attach } : null,
        head: head?.model ? head : null,
        hair,
        fullHead: false,
        hairReplaced,
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
