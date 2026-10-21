import { getCharacterName } from "@/lib/i18n";
import type { CharacterNameTranslationFn } from "@/lib/i18n/characters";
import type { Live2DModel } from "@/lib/live2dViewer/models";
import { UNIT_ID_LABEL_KEYS } from "@/types/types";

type Translate = CharacterNameTranslationFn;

/** Whose model it is: a character's name, a side character's as the id spells it, or the id of a mob's. */
export function live2dOwnerName(t: Translate, model: Live2DModel): string {
    if (model.kind === "character" && model.characterId !== null) return getCharacterName(t, model.characterId);
    if (model.subName) return model.subName.replaceAll("_", " ");
    return model.id;
}

/** The group a model is listed in: its character's, or all side characters', or all mobs'. */
export function live2dGroupKey(model: Live2DModel): string {
    if (model.kind === "character" && model.characterId !== null) return `character:${model.characterId}`;
    return model.kind;
}

/** The heading of a model's group. */
export function live2dGroupName(t: Translate, model: Live2DModel): string {
    if (model.kind === "character" && model.characterId !== null) return getCharacterName(t, model.characterId);
    return t(`page.live2d.kind.${model.kind}`);
}

/** The costume in words: known words from the message packs, a unit by its name, other words as the id spells them. */
export function live2dCostumeLabel(t: Translate, model: Live2DModel): string {
    if (model.collab) return t("page.live2d.collab");
    if (model.kind !== "character") return model.subName?.replaceAll("_", " ") ?? model.id;
    const words = model.costume.map(part => {
        if ("token" in part) {
            const word = t(`page.live2d.costume.${part.token}`);
            return part.variant ? `${word} ${part.variant}` : word;
        }
        if ("unit" in part) return t(UNIT_ID_LABEL_KEYS[part.unit] ?? part.unit);
        if ("cloth" in part) return t("page.live2d.costume.cloth", { number: part.cloth });
        return part.text;
    });
    return words.length > 0 ? words.join(" · ") : t("page.live2d.costume.normal");
}

/** A motion or facial name as the list shows it (the motion bundle's own words). */
export function live2dMotionLabel(name: string): string {
    return name.replace(/^face_/, "");
}
