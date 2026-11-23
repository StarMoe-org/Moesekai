/** How the game uses a model: one of the 26 characters, a supporting character, a collaboration character, or a mob. */
export type Live2DModelKind = "character" | "sub" | "collab" | "mob";

/**
 * A model as the viewer page knows it. The site's listings give `id`, `bundle` and `motion`; the
 * other fields describe a model further when a source provides them.
 */
export interface ILive2DModelEntry {
    /** The model's directory name, e.g. `v2_01ichika_casual`. */
    id: string;
    /** `live2d/model/<id>`. */
    bundle: string;
    /** The directory of its motion set (`live2d/motion/<x>_motion_base`); null for a model without one. */
    motion: string | null;
    /** Every motion bundle the stories used with the model, the default first. */
    motions?: string[];
    kind?: Live2DModelKind;
    /** MasterCharacter id, for a character's model. */
    characterId?: number | null;
    /** SubGameCharacter id, when `characterType == "sub_game_character"`. */
    subCharacterId?: number | null;
    character2dIds?: number[];
    /** `character2ds.assetName`, when present. */
    assetName?: string;
    /** Deterministic grouping key for non-character models (e.g. `anfather`, `sanrio_kitty`). */
    ownerKey?: string;
    /** `character2ds.unit`, when it is not `none`. */
    unit?: string;
    /** `character2ds.characterIconAssetbundleName`, when present. */
    iconBundle?: string;
    /** Server-native story display name (format 2). */
    name?: string;
    /** Additional non-placeholder story speaker aliases (format 2). */
    aliases?: string[];
    /** Multi-region localized names keyed by region (`jp`, `cn`, `tw`, `en`, `kr`). */
    names?: Partial<Record<string, string>>;
    /** Number of story episodes this model appears in. */
    episodeCount?: number;
    /** Representative story episode selectors (`event:1/1`, `unit:1/2`, etc.). */
    episodes?: string[];
    /** What the viewer downloads the first time it opens the model (bytes, files), and the atlas pages. */
    bytes?: number;
    files?: number;
    textures?: number;
}
