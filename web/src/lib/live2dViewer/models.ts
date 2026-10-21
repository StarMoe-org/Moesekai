import type { ILive2DModelIndexEntry, Live2DModelKind } from "../../types/live2d";

/**
 * The models of a story library's index as the viewer page lists them. A model's id is its bundle
 * name, which spells what the game knows of it:
 *
 * - `[v2_]<NN><name>_<costume>`: one of the 26 characters (`NN` is the MasterCharacter id), e.g.
 *   `v2_01ichika_casual`, `21miku_band`; `v2_` marks the second generation of models
 * - `[v2_]clb<NN>_<NN><name>[NN]`: a collaboration's model of a character, e.g. `clb01_24luka01`
 * - `[v2_]sub_<name>`: a side character, e.g. `sub_airichild`, `v2_sub_sanrio_kitty`
 *
 * The master data names no costume, so the costume is shown in words read from the id: the words
 * the message packs know (`page.live2d.costume.*`), a virtual singer's unit version as that unit's
 * name, and any other word as the id spells it.
 */

/** Costume words the message packs name (`page.live2d.costume.<token>`). */
export const LIVE2D_COSTUME_TOKENS = [
    "normal", "casual", "school", "unit", "sports", "pajamas", "parttime", "lesson", "swim", "jc",
    "culture", "yukata", "christmas", "wedding", "tuxedo", "priestess", "archery", "police", "tenniswear", "april",
] as const;

export type Live2DCostumeToken = (typeof LIVE2D_COSTUME_TOKENS)[number];

/** A virtual singer's unit versions, by the unit id of `UNIT_DATA`. */
const UNIT_COSTUMES: Record<string, string> = {
    band: "ln",
    idol: "mmj",
    street: "vbs",
    wonder: "ws",
    night: "25ji",
};

/** A word of a costume: a known word (with its number past the first), a unit, a numbered outfit, or the id's own text. */
export type Live2DCostumePart =
    | { token: Live2DCostumeToken; variant?: number }
    | { unit: string }
    | { cloth: number }
    | { text: string };

export interface Live2DModel {
    id: string;
    /** `live2d/model/<id>`, relative to the library's `library/`. */
    bundle: string;
    /** The motion bundles the stories used with it, the default first; none for a model without one. */
    motions: string[];
    kind: Live2DModelKind;
    /** MasterCharacter id: the index's, else the one the id spells. */
    characterId: number | null;
    /** A side character's name as the id spells it (`sanrio_kitty`). */
    subName: string | null;
    /** 2 for the second generation (`v2_`). */
    generation: 1 | 2;
    /** A collaboration's model (`clb<NN>_`). */
    collab: boolean;
    costume: Live2DCostumePart[];
    bytes: number;
    textures: number;
}

const KNOWN = new Set<string>(LIVE2D_COSTUME_TOKENS);

function costumeWord(word: string): Live2DCostumePart {
    const match = /^([a-z]+?)(\d+)?$/.exec(word);
    const base = match?.[1] ?? word;
    const number = match?.[2] !== undefined ? Number(match[2]) : undefined;
    if (base === "cloth" && number !== undefined) return { cloth: number };
    const unit = UNIT_COSTUMES[word];
    if (unit) return { unit };
    if (KNOWN.has(base)) {
        const token = base as Live2DCostumeToken;
        return number !== undefined && number > 1 ? { token, variant: number } : { token };
    }
    return { text: word };
}

/** What a model's id spells (see the module's comment). */
export function parseLive2DModelId(id: string): Pick<Live2DModel, "generation" | "collab" | "characterId" | "subName" | "costume"> {
    let rest = id;
    const generation = rest.startsWith("v2_") ? 2 : 1;
    if (generation === 2) rest = rest.slice(3);
    const collab = /^clb\d+_/.exec(rest);
    if (collab) {
        rest = rest.slice(collab[0].length);
        const character = /^(\d{2})[a-z]+/.exec(rest);
        return { generation, collab: true, characterId: character ? Number(character[1]) : null, subName: null, costume: [] };
    }
    if (rest.startsWith("sub_")) {
        return { generation, collab: false, characterId: null, subName: rest.slice(4), costume: [] };
    }
    const character = /^(\d{2})[a-z]+_(.+)$/.exec(rest);
    if (character) {
        return {
            generation,
            collab: false,
            characterId: Number(character[1]),
            subName: null,
            costume: character[2].split("_").filter(Boolean).map(costumeWord),
        };
    }
    return { generation, collab: false, characterId: null, subName: null, costume: [{ text: rest }] };
}

function isEntry(value: unknown): value is ILive2DModelIndexEntry {
    if (typeof value !== "object" || value === null) return false;
    const entry = value as ILive2DModelIndexEntry;
    return typeof entry.id === "string" && /^[a-z0-9_]+$/.test(entry.id)
        && typeof entry.bundle === "string"
        && (typeof entry.motion === "string" || entry.motion === null);
}

/** The motion bundles of an entry, the default (`motion`) first. */
function motionBundles(entry: ILive2DModelIndexEntry): string[] {
    const listed = Array.isArray(entry.motions) ? entry.motions.filter((item): item is string => typeof item === "string") : [];
    if (entry.motion === null) return [];
    return [entry.motion, ...listed.filter(item => item !== entry.motion)];
}

/** One index entry as the page lists it. */
export function parseLive2DModel(entry: ILive2DModelIndexEntry): Live2DModel {
    const spelled = parseLive2DModelId(entry.id);
    const characterId = typeof entry.characterId === "number" ? entry.characterId : spelled.characterId;
    const kind: Live2DModelKind = entry.kind === "character" || entry.kind === "sub" || entry.kind === "mob"
        ? entry.kind
        : characterId !== null ? "character" : spelled.subName !== null ? "sub" : "mob";
    return {
        ...spelled,
        id: entry.id,
        bundle: entry.bundle,
        motions: motionBundles(entry),
        kind,
        characterId: kind === "character" ? characterId : null,
        bytes: typeof entry.bytes === "number" ? entry.bytes : 0,
        textures: typeof entry.textures === "number" ? entry.textures : 0,
    };
}

const KIND_ORDER: Record<Live2DModelKind, number> = { character: 0, sub: 1, mob: 2 };
const TOKEN_ORDER = new Map<string, number>(LIVE2D_COSTUME_TOKENS.map((token, index) => [token, index]));

function costumeRank(model: Live2DModel): number {
    const first = model.costume[0];
    if (!first) return 0;
    if ("token" in first) return (TOKEN_ORDER.get(first.token) ?? 0) * 100 + (first.variant ?? 1);
    if ("unit" in first) return 2_000;
    if ("cloth" in first) return 3_000 + first.cloth;
    return 5_000;
}

/** Characters in id order, the newer generation first, everyday costumes before the others; then side characters and mobs by name. */
export function compareLive2DModels(a: Live2DModel, b: Live2DModel): number {
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
        || (a.characterId ?? 0) - (b.characterId ?? 0)
        || (a.subName ?? "").localeCompare(b.subName ?? "")
        || Number(a.collab) - Number(b.collab)
        || b.generation - a.generation
        || costumeRank(a) - costumeRank(b)
        || a.id.localeCompare(b.id);
}

/**
 * The models of a `models.json`, sorted (compareLive2DModels). Entries the page cannot use (no id
 * or bundle) are left out; an index of another format is an error.
 */
export function parseLive2DModelIndex(raw: unknown): Live2DModel[] {
    if (typeof raw !== "object" || raw === null) throw new Error("live2d_index_invalid");
    const index = raw as { format?: unknown; models?: unknown };
    if (index.format !== 1 || !Array.isArray(index.models)) throw new Error("live2d_index_invalid");
    const seen = new Set<string>();
    const models: Live2DModel[] = [];
    for (const entry of index.models) {
        if (!isEntry(entry) || seen.has(entry.id)) continue;
        seen.add(entry.id);
        models.push(parseLive2DModel(entry));
    }
    return models.sort(compareLive2DModels);
}

/** The model the address names (`?model=<id>`), when it is a model id at all. */
export function parseLive2DModelParam(value: string | null | undefined): string | null {
    const id = value?.trim() ?? "";
    return /^[a-z0-9_]+$/.test(id) ? id : null;
}

/** The viewer page, on a server and optionally on one model, or else on a character's models. */
export function live2dViewerHref(region: string, modelId?: string | null, characterId?: number | null): string {
    const query = new URLSearchParams({ server: region });
    if (modelId) query.set("model", modelId);
    else if (characterId) query.set("character", String(characterId));
    return `/live2d?${query.toString()}`;
}

/** The viewer page on a character's models (the site's server; the first of them is shown). */
export function live2dCharacterHref(characterId: number): string {
    return `/live2d?character=${characterId}`;
}

/** The character the address names (`?character=<id>`), when it is one of the 26. */
export function parseLive2DCharacterParam(value: string | null | undefined): number | null {
    const id = Number(value?.trim());
    return Number.isInteger(id) && id >= 1 && id <= 26 ? id : null;
}
