/**
 * The model index of a story library, `<index base>/<region>/models.json`, as SekaiLive2DViewer's
 * index tool writes it. `bundle` and `motion` are what the viewer's `model` option takes.
 */
export interface ILive2DModelIndex {
    format: number;
    region?: string;
    generatedAt?: string;
    /** The story library the index was made from. */
    library?: string;
    /** The game data version the library was unpacked from (`ripper.lock.json`'s `assetVersion`). */
    assetVersion?: string;
    models: ILive2DModelIndexEntry[];
}

/** How the game uses a model: one of the 26 characters, a side character, or a mob. */
export type Live2DModelKind = "character" | "sub" | "mob";

export interface ILive2DModelIndexEntry {
    /** The model bundle's name, e.g. `v2_01ichika_casual`. */
    id: string;
    /** `live2d/model/<id>`. */
    bundle: string;
    /** The default motion bundle (`live2d/motion/<x>_motion_base`); null for a model without one. */
    motion: string | null;
    /** Every motion bundle the stories used with the model, the default first. */
    motions?: string[];
    kind?: Live2DModelKind;
    /** MasterCharacter id, for a character's model. */
    characterId?: number | null;
    character2dIds?: number[];
    /** `character2ds.unit`, when it is not `none`. */
    unit?: string;
    /** What the viewer downloads the first time it opens the model (bytes, files), and the atlas pages. */
    bytes?: number;
    files?: number;
    textures?: number;
}
