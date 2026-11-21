/** How the game uses a model: one of the 26 characters, a side character, or a mob. */
export type Live2DModelKind = "character" | "sub" | "mob";

/**
 * A model as the viewer page finds it on the site: its directory under `live2d/model/` and the
 * motion set it plays with. `bundle` and `motion` are what the viewer's `model` option takes.
 */
export interface ILive2DModelEntry {
    /** The model's directory name, e.g. `v2_01ichika_casual`. */
    id: string;
    /** `live2d/model/<id>`. */
    bundle: string;
    /** The directory of its motion set (`live2d/motion/<x>_motion_base`); null for a model without one. */
    motion: string | null;
}
