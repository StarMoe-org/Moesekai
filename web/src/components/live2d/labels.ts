import {
    compareLive2DModels,
    resolveFallbackSubCharacter,
    type Live2DCostumePart,
    type Live2DModel,
} from "@moesekai/story-core";
import { getCharacterName } from "@/lib/i18n";
import type { CharacterNameTranslationFn } from "@/lib/i18n/characters";
import { UNIT_ID_LABEL_KEYS } from "@/types/types";

type Translate = CharacterNameTranslationFn;

export type Live2DNameRegion = "jp" | "cn" | "tw" | "en" | "kr";

const REGION_FALLBACK_ORDER: Record<Live2DNameRegion, readonly Live2DNameRegion[]> = {
    cn: ["cn", "tw", "jp", "en", "kr"],
    tw: ["tw", "cn", "jp", "en", "kr"],
    en: ["en", "jp", "cn", "tw", "kr"],
    jp: ["jp", "cn", "tw", "en", "kr"],
    kr: ["kr", "jp", "en", "cn", "tw"],
};

/** Map a UI locale (e.g. `zh-CN`, `zh-TW`, `en-US`, `ja-JP`, `ko-KR`) to a server region key. */
export function localeToRegionKey(locale?: string): Live2DNameRegion {
    const normalized = locale?.trim().toLowerCase() ?? "";
    if (!normalized) return "cn";
    if (
        normalized === "tw"
        || normalized === "zh-tw"
        || normalized === "zh-hk"
        || normalized === "zh-hant"
        || normalized.startsWith("zh-hant-")
    ) {
        return "tw";
    }
    if (normalized === "cn" || normalized.startsWith("zh")) return "cn";
    if (normalized === "en" || normalized.startsWith("en-")) return "en";
    if (normalized === "jp" || normalized === "ja" || normalized.startsWith("ja-")) return "jp";
    if (normalized === "kr" || normalized === "ko" || normalized.startsWith("ko-")) return "kr";
    return "cn";
}

function normalizeText(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function resolveLocalizedSubName(model: Live2DModel, locale?: string): string | null {
    const fallback = resolveFallbackSubCharacter(model);

    if (!locale && model.name) {
        return model.name;
    }

    const region = localeToRegionKey(locale);
    for (const candidateRegion of REGION_FALLBACK_ORDER[region]) {
        const fromModel = model.names?.[candidateRegion]?.trim();
        if (fromModel) return fromModel;
        const fromFallback = fallback?.names?.[candidateRegion]?.trim();
        if (fromFallback) return fromFallback;
    }

    if (model.name) return model.name;
    return null;
}

function fallbackRawOwnerName(model: Live2DModel): string {
    if (model.ownerKey) return model.ownerKey.replaceAll("_", " ");
    if (model.subName) return model.subName.replaceAll("_", " ");
    return model.id;
}

/**
 * Whose model it is: for main characters, their localized name; for supporting/collab/mob models,
 * the best localized name from `model.names` -> `subCharacterNames.ts` -> `model.name` -> cleaned id.
 */
export function live2dOwnerName(t: Translate, model: Live2DModel, locale?: string): string {
    if (model.kind === "character" && model.characterId !== null) {
        return getCharacterName(t, model.characterId);
    }
    return resolveLocalizedSubName(model, locale) ?? fallbackRawOwnerName(model);
}

/**
 * Returns the server-native `model.name` or JP name when non-empty and different from the
 * localized primary name (for display as a subtle subtitle). Always null for main characters.
 */
export function live2dSecondaryOwnerName(model: Live2DModel, locale?: string): string | null {
    if (model.kind === "character") return null;
    const primary = resolveLocalizedSubName(model, locale) ?? fallbackRawOwnerName(model);
    const primaryNorm = normalizeText(primary);
    const fallback = resolveFallbackSubCharacter(model);
    const candidates = [model.name, model.names?.jp, fallback?.names?.jp];
    for (const candidate of candidates) {
        const trimmed = candidate?.trim();
        if (!trimmed) continue;
        if (normalizeText(trimmed) !== primaryNorm) return trimmed;
    }
    return null;
}

/** Deduplicated story aliases for a model, excluding its primary and secondary display names. */
export function live2dOwnerAliases(model: Live2DModel, locale?: string): string[] {
    const fallback = resolveFallbackSubCharacter(model);
    const primary = model.kind === "character" ? null : (resolveLocalizedSubName(model, locale) ?? fallbackRawOwnerName(model));
    const secondary = live2dSecondaryOwnerName(model, locale);
    const excluded = new Set<string>();
    if (primary) excluded.add(normalizeText(primary));
    if (secondary) excluded.add(normalizeText(secondary));

    const sourceAliases = model.aliases.length > 0 ? model.aliases : (fallback?.aliases ?? []);
    const out: string[] = [];
    for (const raw of sourceAliases) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const norm = normalizeText(trimmed);
        if (excluded.has(norm)) continue;
        excluded.add(norm);
        out.push(trimmed);
    }
    return out;
}

/** The group a model is listed in: `character:<id>` for main characters, else `sub` | `collab` | `mob`. */
export function live2dGroupKey(model: Live2DModel): string {
    if (model.kind === "character" && model.characterId !== null) return `character:${model.characterId}`;
    return model.kind;
}

/** The heading of a model's group. */
export function live2dGroupName(t: Translate, model: Live2DModel): string {
    if (model.kind === "character" && model.characterId !== null) return getCharacterName(t, model.characterId);
    return t(`page.live2d.kind.${model.kind}`);
}

function formatCostumeParts(t: Translate, parts: readonly Live2DCostumePart[]): string {
    if (parts.length === 0) return t("page.live2d.costume.normal");
    if (parts.length === 1 && "variant" in parts[0] && !("token" in parts[0])) {
        return `${t("page.live2d.costume.normal")} ${parts[0].variant}`;
    }
    const words = parts.map(part => {
        if ("token" in part) {
            const word = t(`page.live2d.costume.${part.token}`);
            return part.variant ? `${word} ${part.variant}` : word;
        }
        if ("unit" in part) return t(UNIT_ID_LABEL_KEYS[part.unit] ?? part.unit);
        if ("cloth" in part) return t("page.live2d.costume.cloth", { number: part.cloth });
        if ("variant" in part) return `#${part.variant}`;
        return part.text;
    });
    return words.length > 0 ? words.join(" \u00b7 ") : t("page.live2d.costume.normal");
}

/**
 * The costume or variant in words: works for main characters AND supporting/collab/mob variants.
 * Sub/collab models with no variant suffix display `page.live2d.costume.normal`.
 */
export function live2dCostumeLabel(t: Translate, model: Live2DModel): string {
    if (model.collab) return t("page.live2d.collab");
    if (model.kind !== "character") return formatCostumeParts(t, model.subVariant);
    return formatCostumeParts(t, model.costume);
}

/**
 * Search matcher across localized owner name, secondary name, all 5 language names, aliases,
 * costume/variant label, group heading, `ownerKey`, `subName`, `assetName`, and `id`.
 */
export function live2dModelMatchesQuery(
    t: Translate,
    model: Live2DModel,
    query: string,
    locale?: string,
): boolean {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return true;
    const terms = normalizedQuery.split(" ").filter(Boolean);
    if (terms.length === 0) return true;

    const fallback = resolveFallbackSubCharacter(model);
    const fields: string[] = [
        live2dOwnerName(t, model, locale),
        live2dCostumeLabel(t, model),
        live2dGroupName(t, model),
        model.id,
    ];

    if (model.kind === "character" && model.characterId !== null) {
        fields.push(getCharacterName(t, model.characterId, "short"));
    }

    const secondary = live2dSecondaryOwnerName(model, locale);
    if (secondary) fields.push(secondary);
    if (model.name) fields.push(model.name);
    if (model.ownerKey) {
        fields.push(model.ownerKey);
        fields.push(model.ownerKey.replaceAll("_", " "));
    }
    if (model.subName) {
        fields.push(model.subName);
        fields.push(model.subName.replaceAll("_", " "));
    }
    if (model.assetName) fields.push(model.assetName);

    for (const value of Object.values(model.names)) {
        if (value) fields.push(value);
    }
    if (fallback) {
        for (const value of Object.values(fallback.names)) {
            if (value) fields.push(value);
        }
        if (fallback.aliases) fields.push(...fallback.aliases);
    }
    if (model.aliases.length > 0) fields.push(...model.aliases);

    const haystack = normalizeText(fields.join(" "));
    return terms.every(term => haystack.includes(term));
}

export interface Live2DOwnerGroup {
    ownerKey: string;
    displayName: string;
    secondaryName: string | null;
    aliases: string[];
    models: Live2DModel[];
    totalEpisodes: number;
}

/**
 * Group models by owner (`ownerKey` for `sub`/`collab`/`mob`, `character:<id>` for main characters).
 * Within each group, models are ordered via `compareLive2DModels` (default/v2 first, silhouettes last).
 * Groups are ordered by `totalEpisodes` descending, then localized `displayName` and `ownerKey`.
 */
export function groupLive2DModelsByOwner(
    t: Translate,
    models: readonly Live2DModel[],
    locale?: string,
): Live2DOwnerGroup[] {
    const byOwner = new Map<string, Live2DModel[]>();
    for (const model of models) {
        const key = model.ownerKey
            ?? (model.kind === "character" && model.characterId !== null ? `character:${model.characterId}` : model.subName ?? model.id);
        const bucket = byOwner.get(key);
        if (bucket) bucket.push(model);
        else byOwner.set(key, [model]);
    }

    const groups: Live2DOwnerGroup[] = [];
    for (const [ownerKey, groupModels] of byOwner.entries()) {
        const sorted = [...groupModels].sort(compareLive2DModels);
        const representative = sorted[0];

        // Pick the best localized display name & secondary name from the group (preferring representative).
        let displayName = live2dOwnerName(t, representative, locale);
        if (representative.kind !== "character" && !resolveLocalizedSubName(representative, locale)) {
            for (const candidate of sorted.slice(1)) {
                const resolved = resolveLocalizedSubName(candidate, locale);
                if (resolved) {
                    displayName = resolved;
                    break;
                }
            }
        }

        let secondaryName = live2dSecondaryOwnerName(representative, locale);
        if (!secondaryName && representative.kind !== "character") {
            const primaryNorm = normalizeText(displayName);
            for (const candidate of sorted.slice(1)) {
                const nextSecondary = live2dSecondaryOwnerName(candidate, locale);
                if (nextSecondary && normalizeText(nextSecondary) !== primaryNorm) {
                    secondaryName = nextSecondary;
                    break;
                }
            }
        }

        const excluded = new Set<string>([normalizeText(displayName)]);
        if (secondaryName) excluded.add(normalizeText(secondaryName));
        const hasIndexAliases = sorted.some(candidate => candidate.aliases.length > 0);
        const aliases: string[] = [];
        for (const candidate of sorted) {
            const candidateAliases = hasIndexAliases ? candidate.aliases : live2dOwnerAliases(candidate, locale);
            for (const raw of candidateAliases) {
                const alias = raw.trim();
                if (!alias) continue;
                const norm = normalizeText(alias);
                if (excluded.has(norm)) continue;
                excluded.add(norm);
                aliases.push(alias);
            }
        }

        const totalEpisodes = sorted.reduce((sum, item) => sum + item.episodeCount, 0);
        groups.push({
            ownerKey,
            displayName,
            secondaryName,
            aliases,
            models: sorted,
            totalEpisodes,
        });
    }

    groups.sort((a, b) => (
        b.totalEpisodes - a.totalEpisodes
        || a.displayName.localeCompare(b.displayName, locale)
        || a.ownerKey.localeCompare(b.ownerKey)
    ));
    return groups;
}

/** A motion or facial name as the list shows it (the motion bundle's own words). */
export function live2dMotionLabel(name: string): string {
    return name.replace(/^face_/, "");
}
