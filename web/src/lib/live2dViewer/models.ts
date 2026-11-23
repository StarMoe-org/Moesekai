import type { ILive2DModelEntry, Live2DModelKind } from "../../types/live2d";

/**
 * The models a site publishes for a server, as the viewer page lists them. A model's id is the
 * name of its directory under `live2d/model/` (its bundle's name), which spells what the game
 * knows of it:
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
    /** `live2d/model/<id>`: the directory that holds its `live2d-model` asset. */
    bundle: string;
    /** The directory of its motion set (`live2d/motion/<…>_motion_base`); none for a model without one. */
    motions: string[];
    kind: Live2DModelKind;
    /** MasterCharacter id, as the id spells it. */
    characterId: number | null;
    /** A side character's name as the id spells it (`sanrio_kitty`). */
    subName: string | null;
    /** 2 for the second generation (`v2_`). */
    generation: 1 | 2;
    /** A collaboration's model (`clb<NN>_`). */
    collab: boolean;
    costume: Live2DCostumePart[];
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

/** A model the site lists, as the page shows it. */
export function parseLive2DModel(entry: ILive2DModelEntry): Live2DModel {
    const spelled = parseLive2DModelId(entry.id);
    const kind: Live2DModelKind = spelled.characterId !== null ? "character" : spelled.subName !== null ? "sub" : "mob";
    return { ...spelled, id: entry.id, bundle: entry.bundle, motions: entry.motion ? [entry.motion] : [], kind };
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
 * The motion set a model plays with, of `motionSets` (the directories under `live2d/motion/`):
 * `<stem>_motion_base` for the longest stem of the model's name that has one. A character's stem
 * is `<NN><name>` (`v2_01ichika_casual` → `v2_01ichika`, then `01ichika`); a side character's is
 * its name less words from the end, each also without a trailing number or `black`
 * (`sub_arisa02_lesson` → `sub_arisa02`, `sub_arisa`). Null when none matches.
 */
export function live2dMotionSet(id: string, motionSets: ReadonlySet<string>): string | null {
    const generation = id.startsWith("v2_") ? "v2_" : "";
    const rest = id.slice(generation.length);
    const prefixes = generation ? [generation, ""] : [""];
    const trimmed = (stem: string) => stem.replace(/(?:black|\d+)+$/, "");
    const character = /^(?:clb\d+_)?(\d{2}[a-z]+)/.exec(rest);
    const parts = rest.split("_");
    const stems = character
        ? [character[1], trimmed(character[1])]
        : parts.flatMap((_, index) => {
            const stem = parts.slice(0, parts.length - index).join("_");
            return [stem, trimmed(stem)];
        });
    for (const stem of stems) {
        for (const prefix of prefixes) {
            const name = `${prefix}${stem}_motion_base`;
            if (motionSets.has(name)) return name;
        }
    }
    return null;
}

/**
 * The models of a server, from the directories under `live2d/model/` and `live2d/motion/` of its
 * publication, sorted (compareLive2DModels). Names that are not model ids are left out.
 */
export function live2dModelsFromListings(modelDirectories: string[], motionDirectories: string[]): Live2DModel[] {
    const motionSets = new Set(motionDirectories);
    const seen = new Set<string>();
    const models: Live2DModel[] = [];
    for (const id of modelDirectories) {
        if (!/^[a-z0-9_]+$/.test(id) || seen.has(id)) continue;
        seen.add(id);
        const motionSet = live2dMotionSet(id, motionSets);
        models.push(parseLive2DModel({ id, bundle: `live2d/model/${id}`, motion: motionSet ? `live2d/motion/${motionSet}` : null }));
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
