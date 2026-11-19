/**
 * This site's catalogue of a server's Live2D models (`/api/live2d/<region>/models`), derived by the
 * backend from the episodes of the version the story data site publishes now. `complete` is false
 * while it is being built.
 */
export interface ILive2DCatalogue {
    published_version: string;
    complete: boolean;
    models: ILive2DCatalogueModel[];
}

export interface ILive2DCatalogueModel {
    /** The model's bundle name, e.g. `v2_01ichika_casual`. */
    id: string;
    /** Its `live2d-model` asset, which the viewer opens. */
    asset: string;
    /** Bytes of what opening it fetches (moc, physics, textures), and its textures. */
    size: number;
    textures: number;
    /** The characters the stories show it as, the most episodes first. */
    characters: { character2d_id: number; motion_set?: string; episodes: number }[];
}

/** How the game uses a model: one of the 26 characters, a side character, or a mob. */
export type Live2DModelKind = "character" | "sub" | "mob";

/** One model as the page lists it before parsing (see models.ts). */
export interface ILive2DModelIndexEntry {
    /** The model bundle's name, e.g. `v2_01ichika_casual`. */
    id: string;
    /** `live2d/model/<id>`: the directory holding the model's asset. */
    bundle: string;
    /** The `live2d-model` asset, when known (else the viewer finds it in `bundle`). */
    asset?: string;
    /** The default motion set (a `live2d-motions` asset, or a directory holding one); null for a model without one. */
    motion: string | null;
    /** Every motion set the stories used with the model, the default first. */
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
