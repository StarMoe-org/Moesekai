import type { ILive2DModelIndexEntry, Live2DModelKind } from "../../types/live2d";

/**
 * The models of a story library's index as the viewer page lists them. A model's id is its bundle
 * name, which spells what the game knows of it:
 *
 * - `[v2_]<NN><name>_<costume>`: one of the 26 characters (`NN` is the MasterCharacter id), e.g.
 *   `v2_01ichika_casual`, `21miku_band`; `v2_` marks the second generation of models
 * - `[v2_]clb<NN>_<NN><name>[NN]`: a collaboration's model of a character, e.g. `clb01_24luka01`
 * - `[v2_]sub_<name>`: a supporting or collaboration character, e.g. `sub_airichild`, `v2_sub_sanrio_kitty`
 *
 * The master data names no costume, so the costume is shown in words read from the id: the words
 * the message packs know (`page.live2d.costume.*`), a virtual singer's unit version as that unit's
 * name, and any other word as the id spells it.
 */

/** Costume words the message packs name (`page.live2d.costume.<token>`). */
export const LIVE2D_COSTUME_TOKENS = [
    "normal", "casual", "school", "unit", "sports", "pajamas", "parttime", "lesson", "swim", "jc",
    "culture", "yukata", "christmas", "wedding", "tuxedo", "priestess", "archery", "police", "tenniswear", "april",
    "black", "zoom", "back", "live", "stage", "rw", "young", "child", "patient", "side",
    "sunset", "fancostume", "transform", "princess", "ponytail", "vest", "liondance", "dark", "long", "still",
    "mask", "cheerful",
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

/** A word of a costume or variant: a known word (with optional number), a unit, a numbered outfit, a bare variant number, or the id's own text. */
export type Live2DCostumePart =
    | { token: Live2DCostumeToken; variant?: number }
    | { unit: string }
    | { cloth: number }
    | { variant: number }
    | { text: string };

export interface Live2DModel {
    id: string;
    /** `live2d/model/<id>`, relative to the library's `library/`. */
    bundle: string;
    /** The motion bundles the stories used with it, the default first; none for a model without one. */
    motions: string[];
    kind: Live2DModelKind;
    /** MasterCharacter id: the index's, else the one the id spells (preserved for main-char special models). */
    characterId: number | null;
    /** SubGameCharacter id when `characterType == "sub_game_character"`. */
    subCharacterId: number | null;
    /** `character2ds.assetName`, when present. */
    assetName: string | null;
    /** Deterministic grouping key for `sub` / `collab` / `mob` models (null for `character`). */
    ownerKey: string | null;
    /** `character2ds.characterIconAssetbundleName`, when present. */
    iconBundle: string | null;
    /** `character2ds.unit`, when present and not `none`. */
    unit: string | null;
    /** Server-native story display name (format 2). */
    name: string | null;
    /** Additional non-placeholder story speaker aliases (format 2). */
    aliases: string[];
    /** Multi-region localized names keyed by region (`jp`, `cn`, `tw`, `en`, `kr`). */
    names: Partial<Record<string, string>>;
    /** Number of story episodes this model appears in. */
    episodeCount: number;
    /** Representative story episode selectors. */
    episodes: string[];
    /** A side character's name as the id spells it (`sanrio_kitty`). */
    subName: string | null;
    /** Parsed variant words for `sub` / `collab` / `mob` models. */
    subVariant: Live2DCostumePart[];
    /** 2 for the second generation (`v2_`). */
    generation: 1 | 2;
    /** A collaboration's model (`clb<NN>_`). */
    collab: boolean;
    costume: Live2DCostumePart[];
    bytes: number;
    textures: number;
}

const KNOWN = new Set<string>(LIVE2D_COSTUME_TOKENS);

const MAIN_CHARACTER_PREFIX_RE = /^(?:v2_)?(?:clb\d+_)?(0[1-9]|1\d|2[0-6])[a-z]+/;
const COLLAB_SUB_PREFIX_RE = /^(?:v2_)?sub_(?:sanrio|enst|egg)_/;
const SUB_OWNER_VARIANT_SEGMENT_RE = /^(?:black\d*|zoom|side|stage|casual|lesson|rw|patient|sunset|cloth|jc|school|transform|live\d*)$/;
const CHILD_PREFIX_SUBNAME_RE = /^child(\d+)?_[a-z]+(?:_(.+))?$/;
const CHILD_SUFFIX_SUBNAME_RE = /^[a-z]+child(\d+)?(black\d*)?(?:_(.+))?$/;
const MAIN_CHARACTER_SUBNAME_RE = /^(?:ichika|saki|honami|shiho|minori|haruka|airi|shizuku|kohane|an|akito|touya|toya|tsukasa|emu|nene|rui|kanade|mafuyu|ena|mizuki|miku|rin|len|luka|meiko|kaito)_(.+)$/;

function blackTokenPart(digits?: string, keepVariantOne = false): Live2DCostumePart {
    if (digits !== undefined) {
        const number = Number(digits);
        if (keepVariantOne || number > 1) return { token: "black", variant: number };
    }
    return { token: "black" };
}

function costumeWords(word: string): Live2DCostumePart[] {
    if (!word) return [];

    // Compound: cloth<N>black[<M>]
    const clothBlack = /^cloth(\d+)black(\d+)?$/.exec(word);
    if (clothBlack) {
        return [{ cloth: Number(clothBlack[1]) }, blackTokenPart(clothBlack[2])];
    }

    // Compound: darkcloth<N>
    const darkCloth = /^darkcloth(\d+)$/.exec(word);
    if (darkCloth) {
        return [{ token: "dark" }, { cloth: Number(darkCloth[1]) }];
    }

    // Compound: darkunit[<N>]
    const darkUnit = /^darkunit(\d+)?$/.exec(word);
    if (darkUnit) {
        const num = darkUnit[1] !== undefined ? Number(darkUnit[1]) : undefined;
        return [{ token: "dark" }, num !== undefined && num > 1 ? { token: "unit", variant: num } : { token: "unit" }];
    }

    // Compound: longnormal[<N>] / longunit[<N>]
    const longCompound = /^long(normal|unit)(\d+)?$/.exec(word);
    if (longCompound) {
        const token = longCompound[1] as "normal" | "unit";
        const num = longCompound[2] !== undefined ? Number(longCompound[2]) : undefined;
        return [{ token: "long" }, num !== undefined && num > 1 ? { token, variant: num } : { token }];
    }

    // Compound: jccloth[<N>]
    const jcCloth = /^jccloth(\d+)?$/.exec(word);
    if (jcCloth) {
        if (jcCloth[1] !== undefined) return [{ token: "jc" }, { cloth: Number(jcCloth[1]) }];
        return [{ token: "jc" }, { token: "casual" }];
    }

    // Compound: maskcloth[<N>]
    const maskCloth = /^maskcloth(\d+)?$/.exec(word);
    if (maskCloth) {
        if (maskCloth[1] !== undefined) return [{ token: "mask" }, { cloth: Number(maskCloth[1]) }];
        return [{ token: "mask" }, { token: "casual" }];
    }

    // Compound: <unit>black[<N>] or <known>black[<N>]
    const suffixedBlack = /^([a-z]+?)black(\d+)?$/.exec(word);
    if (suffixedBlack && suffixedBlack[1].length > 0 && suffixedBlack[1] !== "black") {
        const prefix = suffixedBlack[1];
        const unit = UNIT_COSTUMES[prefix];
        if (unit) return [{ unit }, blackTokenPart(suffixedBlack[2])];
        if (KNOWN.has(prefix)) {
            return [{ token: prefix as Live2DCostumeToken }, blackTokenPart(suffixedBlack[2])];
        }
    }

    const match = /^([a-z]+?)(\d+)?$/.exec(word);
    const base = match?.[1] ?? word;
    const number = match?.[2] !== undefined ? Number(match[2]) : undefined;
    if (/^\d+$/.test(word)) return [{ variant: Number(word) }];
    if (base === "cloth") return [number !== undefined ? { cloth: number } : { token: "casual" }];
    const unit = UNIT_COSTUMES[word];
    if (unit) return [{ unit }];
    if (KNOWN.has(base)) {
        const token = base as Live2DCostumeToken;
        return [number !== undefined && number > 1 ? { token, variant: number } : { token }];
    }
    return [{ text: word }];
}

function subVariantWord(word: string): Live2DCostumePart[] {
    if (!word) return [];

    // Pure numeric variant segment, e.g. `02` from merged `arisa02` -> `arisa`.
    if (/^\d+$/.test(word)) {
        return [{ variant: Number(word) }];
    }

    // Glued leading numeric variant + trailing token, e.g. `02black`.
    const leadingNumber = /^(\d+)([a-z].*)$/.exec(word);
    if (leadingNumber) {
        return [{ variant: Number(leadingNumber[1]) }, ...subVariantWord(leadingNumber[2])];
    }

    // Glued `<known>black[<N>]`, e.g. `youngblack`.
    const suffixedBlack = /^([a-z]+?)black(\d+)?$/.exec(word);
    if (suffixedBlack && suffixedBlack[1].length > 0 && suffixedBlack[1] !== "black" && KNOWN.has(suffixedBlack[1])) {
        return [
            { token: suffixedBlack[1] as Live2DCostumeToken },
            blackTokenPart(suffixedBlack[2], true),
        ];
    }

    const match = /^([a-z]+?)(\d+)?$/.exec(word);
    const base = match?.[1] ?? word;
    const number = match?.[2] !== undefined ? Number(match[2]) : undefined;
    if (base === "cloth") return [number !== undefined ? { cloth: number } : { token: "casual" }];
    if (KNOWN.has(base)) {
        const token = base as Live2DCostumeToken;
        return [number !== undefined ? { token, variant: number } : { token }];
    }
    return [{ text: word }];
}

/** Deterministic base `ownerKey` for a non-character model id (before cross-model `02` merge). */
export function deriveSubOwnerKey(id: string): string | null {
    const rest = id.replace(/^v2_/, "").replace(/^sub_/, "");
    if (!rest) return null;
    const segments = rest.split("_").filter(Boolean);
    if (segments.length === 0) return null;
    while (segments.length > 1 && SUB_OWNER_VARIANT_SEGMENT_RE.test(segments[segments.length - 1])) {
        segments.pop();
    }
    let last = segments[segments.length - 1];
    while (true) {
        const glued = /^(.*?)(?:black\d*|young)$/.exec(last);
        if (!glued || glued[1].length < 3) break;
        last = glued[1];
    }
    segments[segments.length - 1] = last;
    return segments.join("_");
}

/** Parse variant parts of a non-character model id relative to its resolved `ownerKey`. */
export function parseLive2DSubVariant(id: string, ownerKey: string | null): Live2DCostumePart[] {
    if (!ownerKey) return [];
    const rest = id.replace(/^v2_/, "").replace(/^sub_/, "");
    if (!rest || rest === ownerKey || !rest.startsWith(ownerKey)) return [];
    const suffix = rest.slice(ownerKey.length).replace(/^_+/, "");
    if (!suffix) return [];
    return suffix.split("_").filter(Boolean).flatMap(subVariantWord);
}

function parseMainCharacterIdFromText(text: string | null | undefined): number | null {
    if (!text) return null;
    const match = MAIN_CHARACTER_PREFIX_RE.exec(text);
    return match ? Number(match[1]) : null;
}

/**
 * Parse costume parts from `sub_*` ids that belong to one of the 26 main characters
 * (e.g. `sub_airichild`, `sub_airichildblack`, `sub_akitochild02`, `sub_harukachild_black`,
 * `sub_shihochild_js`, `v2_sub_child_ichika`, `v2_sub_child10_ichika`, `sub_emu_princess`).
 */
function parseCharacterSubCostume(subName: string): Live2DCostumePart[] {
    const childPrefix = CHILD_PREFIX_SUBNAME_RE.exec(subName);
    if (childPrefix) {
        const number = childPrefix[1] !== undefined ? Number(childPrefix[1]) : undefined;
        const parts: Live2DCostumePart[] = [
            number !== undefined && number > 1 ? { token: "child", variant: number } : { token: "child" },
        ];
        if (childPrefix[2]) {
            parts.push(...childPrefix[2].split("_").filter(Boolean).flatMap(costumeWords));
        }
        return parts;
    }

    const childSuffix = CHILD_SUFFIX_SUBNAME_RE.exec(subName);
    if (childSuffix) {
        const number = childSuffix[1] !== undefined ? Number(childSuffix[1]) : undefined;
        const parts: Live2DCostumePart[] = [
            number !== undefined && number > 1 ? { token: "child", variant: number } : { token: "child" },
        ];
        if (childSuffix[2]) {
            const digits = childSuffix[2].slice("black".length);
            parts.push(blackTokenPart(digits.length > 0 ? digits : undefined));
        }
        if (childSuffix[3]) {
            parts.push(...childSuffix[3].split("_").filter(Boolean).flatMap(costumeWords));
        }
        return parts;
    }

    const namedCostume = MAIN_CHARACTER_SUBNAME_RE.exec(subName);
    if (namedCostume) {
        return namedCostume[1].split("_").filter(Boolean).flatMap(costumeWords);
    }

    return [];
}

/** What a model's id spells (see the module's comment). */
export function parseLive2DModelId(id: string): Pick<Live2DModel, "generation" | "collab" | "characterId" | "subName" | "costume"> {
    let rest = id;
    const generation = rest.startsWith("v2_") ? 2 : 1;
    if (generation === 2) rest = rest.slice(3);
    const collab = /^clb\d+_/.exec(rest);
    if (collab) {
        rest = rest.slice(collab[0].length);
        const character = /^(0[1-9]|1\d|2[0-6])[a-z]+/.exec(rest);
        return { generation, collab: true, characterId: character ? Number(character[1]) : null, subName: null, costume: [] };
    }
    if (rest.startsWith("sub_")) {
        return { generation, collab: false, characterId: null, subName: rest.slice(4), costume: [] };
    }
    const character = /^(0[1-9]|1\d|2[0-6])[a-z]+_(.+)$/.exec(rest);
    if (character) {
        return {
            generation,
            collab: false,
            characterId: Number(character[1]),
            subName: null,
            costume: character[2].split("_").filter(Boolean).flatMap(costumeWords),
        };
    }
    const bareCharacter = /^(0[1-9]|1\d|2[0-6])[a-z]+$/.exec(rest);
    if (bareCharacter) {
        return { generation, collab: false, characterId: Number(bareCharacter[1]), subName: null, costume: [] };
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

function trimmedString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of value) {
        const text = trimmedString(item);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push(text);
    }
    return out;
}

function parseNamesRecord(value: unknown): Partial<Record<string, string>> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const out: Partial<Record<string, string>> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const text = trimmedString(raw);
        if (text) out[key] = text;
    }
    return out;
}

/** One index entry as the page lists it. */
export function parseLive2DModel(entry: ILive2DModelIndexEntry): Live2DModel {
    const spelled = parseLive2DModelId(entry.id);
    const assetName = trimmedString(entry.assetName);
    const iconBundle = trimmedString(entry.iconBundle);
    const rawUnit = trimmedString(entry.unit);
    const unit = rawUnit && rawUnit !== "none" ? rawUnit : null;
    const name = trimmedString(entry.name);
    const aliases = parseStringList(entry.aliases);
    const names = parseNamesRecord(entry.names);
    const episodes = parseStringList(entry.episodes);
    const episodeCount = typeof entry.episodeCount === "number" && Number.isFinite(entry.episodeCount) && entry.episodeCount >= 0
        ? Math.trunc(entry.episodeCount)
        : 0;
    const subCharacterId = typeof entry.subCharacterId === "number" && Number.isFinite(entry.subCharacterId)
        ? entry.subCharacterId
        : null;

    const entryCharacterId = typeof entry.characterId === "number" && Number.isInteger(entry.characterId) && entry.characterId >= 1 && entry.characterId <= 26
        ? entry.characterId
        : null;
    const resolvedCharacterId = entryCharacterId ?? spelled.characterId ?? parseMainCharacterIdFromText(assetName);

    let kind: Live2DModelKind;
    if (resolvedCharacterId !== null) {
        kind = "character";
    } else if (
        entry.kind === "collab"
        || Boolean(iconBundle?.endsWith("_collabo"))
        || COLLAB_SUB_PREFIX_RE.test(entry.id)
        || (assetName !== null && COLLAB_SUB_PREFIX_RE.test(assetName))
    ) {
        kind = "collab";
    } else if (
        entry.kind === "sub"
        || subCharacterId !== null
        || spelled.subName !== null
        || (assetName !== null && /^(?:v2_)?sub_/.test(assetName))
        || name !== null
    ) {
        kind = "sub";
    } else if (entry.kind === "character") {
        kind = "character";
    } else {
        kind = "mob";
    }

    const ownerKey = kind === "character"
        ? null
        : (trimmedString(entry.ownerKey) ?? deriveSubOwnerKey(entry.id));
    const subVariant = kind === "character" ? [] : parseLive2DSubVariant(entry.id, ownerKey);
    const costume = kind === "character" && spelled.subName !== null && spelled.costume.length === 0
        ? parseCharacterSubCostume(spelled.subName)
        : spelled.costume;

    return {
        ...spelled,
        id: entry.id,
        bundle: entry.bundle,
        motions: motionBundles(entry),
        kind,
        characterId: kind === "character" ? resolvedCharacterId : null,
        subCharacterId,
        assetName,
        ownerKey,
        iconBundle,
        unit,
        name,
        aliases,
        names,
        episodeCount,
        episodes,
        subVariant,
        costume,
        bytes: typeof entry.bytes === "number" ? entry.bytes : 0,
        textures: typeof entry.textures === "number" ? entry.textures : 0,
    };
}

const KIND_ORDER: Record<Live2DModelKind, number> = { character: 0, sub: 1, collab: 2, mob: 3 };
const TOKEN_ORDER = new Map<string, number>(LIVE2D_COSTUME_TOKENS.map((token, index) => [token, index]));
const ORIGINAL_TOKEN_COUNT = 20;

function hasPartToken(parts: readonly Live2DCostumePart[], token: Live2DCostumeToken): boolean {
    return parts.some(part => "token" in part && part.token === token);
}

function costumeRank(model: Live2DModel): number {
    const first = model.costume[0];
    if (!first) return 0;
    const secondaryPenalty = hasPartToken(model.costume, "black") || hasPartToken(model.costume, "zoom") ? 1_000_000 : 0;
    if ("token" in first) {
        const idx = TOKEN_ORDER.get(first.token) ?? 99;
        const base = idx < ORIGINAL_TOKEN_COUNT ? idx * 10_000 : 400_000 + (idx - ORIGINAL_TOKEN_COUNT) * 10_000;
        return base + (first.variant ?? 1) + secondaryPenalty;
    }
    if ("unit" in first) return 200_000 + secondaryPenalty;
    if ("cloth" in first) return 300_000 + first.cloth + secondaryPenalty;
    if ("variant" in first) return 350_000 + first.variant + secondaryPenalty;
    return 900_000 + secondaryPenalty;
}

const SUB_OUTFIT_ORDER: Record<string, number> = {
    live: 10,
    stage: 20,
    casual: 30,
    lesson: 40,
    school: 50,
    rw: 60,
    jc: 70,
    sunset: 80,
    transform: 90,
};

/**
 * Tiered ranking for `sub` / `collab` / `mob` variants:
 * 0: default / normal (including plain `02` variant)
 * 1: outfits (`live`, `stage`, `casual`, `lesson`, `rw`, etc.)
 * 2: age/status variants (`young`, `child`, `patient`)
 * 3: camera/angle variants (`zoom`, `side`, `back`)
 * 4: silhouette (`black`)
 */
function subVariantTier(parts: readonly Live2DCostumePart[]): number {
    if (parts.length === 0) return 0;
    if (hasPartToken(parts, "black")) return 4;
    if (hasPartToken(parts, "zoom") || hasPartToken(parts, "side") || hasPartToken(parts, "back")) return 3;
    if (hasPartToken(parts, "young") || hasPartToken(parts, "child") || hasPartToken(parts, "patient")) return 2;
    const onlyBareVariant = parts.every(part => "variant" in part && !("token" in part));
    if (onlyBareVariant) return 0;
    return 1;
}

function subVariantSubRank(parts: readonly Live2DCostumePart[]): number {
    if (parts.length === 0) return 0;
    let score = 0;
    for (const part of parts) {
        if ("token" in part) {
            const explicit = SUB_OUTFIT_ORDER[part.token];
            const tokenScore = explicit !== undefined ? explicit * 100 : (TOKEN_ORDER.get(part.token) ?? 99) * 100 + 1_000;
            score = Math.max(score, tokenScore + (part.variant ?? 0));
        } else if ("cloth" in part) {
            score = Math.max(score, 5_000 + part.cloth);
        } else if ("variant" in part) {
            score += part.variant;
        } else if ("text" in part) {
            score = Math.max(score, 9_000);
        }
    }
    return score;
}

/**
 * Characters in id order, the newer generation first, everyday costumes before the others;
 * supporting / collab / mob models grouped by `ownerKey`, default variants before outfits before
 * `young`/`patient` before `zoom`/`black`, newest generation (`v2`) first within each tier.
 */
export function compareLive2DModels(a: Live2DModel, b: Live2DModel): number {
    const kindDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kindDiff !== 0) return kindDiff;

    if (a.kind === "character") {
        return (a.characterId ?? 0) - (b.characterId ?? 0)
            || Number(a.collab) - Number(b.collab)
            || b.generation - a.generation
            || costumeRank(a) - costumeRank(b)
            || a.id.localeCompare(b.id);
    }

    const ownerA = a.ownerKey ?? a.subName ?? a.id;
    const ownerB = b.ownerKey ?? b.subName ?? b.id;
    return ownerA.localeCompare(ownerB)
        || subVariantTier(a.subVariant) - subVariantTier(b.subVariant)
        || b.generation - a.generation
        || subVariantSubRank(a.subVariant) - subVariantSubRank(b.subVariant)
        || a.id.localeCompare(b.id);
}

/**
 * The models of a `models.json` (format 1 or format 2), sorted (`compareLive2DModels`).
 * Entries the page cannot use (no id or bundle) are left out; an index of another format is an error.
 */
export function parseLive2DModelIndex(raw: unknown): Live2DModel[] {
    if (typeof raw !== "object" || raw === null) throw new Error("live2d_index_invalid");
    const index = raw as { format?: unknown; models?: unknown };
    if ((index.format !== 1 && index.format !== 2) || !Array.isArray(index.models)) {
        throw new Error("live2d_index_invalid");
    }
    const seen = new Set<string>();
    const models: Live2DModel[] = [];
    for (const entry of index.models) {
        if (!isEntry(entry) || seen.has(entry.id)) continue;
        seen.add(entry.id);
        models.push(parseLive2DModel(entry));
    }

    // Second pass: normalize `<stem>02` -> `<stem>` when `<stem>` also exists among non-character ownerKeys.
    const ownerKeys = new Set<string>();
    for (const model of models) {
        if (model.kind !== "character" && model.ownerKey) {
            ownerKeys.add(model.ownerKey);
        }
    }
    for (const model of models) {
        if (model.kind === "character" || !model.ownerKey || !model.ownerKey.endsWith("02")) continue;
        const stem = model.ownerKey.slice(0, -2);
        if (stem.length > 0 && ownerKeys.has(stem)) {
            model.ownerKey = stem;
            model.subVariant = parseLive2DSubVariant(model.id, stem);
        }
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
