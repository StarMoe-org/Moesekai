/**
 * Where the game draws each piece of a bonds honor, in SVG pixels (y grows downward).
 *
 * Taken from the client's `UIPartsBondsHonorImage` prefab and its `SetSlot()`:
 * - the badge is 380×80 in the main slot and 180×80 in a sub slot;
 * - the left colour fills `width / 2 + 3` and sits on top of the right colour, which fills the badge;
 * - the `degree_bgTexture_main|sub` pattern (white inner ring and shapes) covers the badge;
 * - each SD character is a 160×136 image anchored by its bottom outer corner: scale 1 and 12px below
 *   the badge in the main slot, scale 0.77 and flush with the bottom in a sub slot;
 * - only in a sub slot, each character is clipped to a 103.5px strip from its own edge, so the two
 *   strips overlap in the middle and the right character is drawn over the left one;
 * - the level icons (16×16, 16px apart, the first centred at 58,72) and the word are drawn over the frame.
 */

export const BONDS_HONOR_HEIGHT = 80;
const CHARACTER_WIDTH = 160;
const CHARACTER_HEIGHT = 136;
const SUB_CHARACTER_SCALE = 0.77;
const MAIN_CHARACTER_DROP = 12;
const SUB_CHARACTER_CLIP_WIDTH = 103.5;
const LEFT_BACKGROUND_OVERLAP = 3;
const LEVEL_ICON_SIZE = 16;

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BondsHonorLayout {
    width: number;
    height: number;
    leftBackground: Rect;
    leftCharacter: Rect;
    rightCharacter: Rect;
    /** Strip each character is clipped to; absent in the main slot, where only the badge outline clips. */
    leftCharacterClip?: Rect;
    rightCharacterClip?: Rect;
    /** Where the `index`-th level icon (0-based) goes. */
    levelIcon: (index: number) => Rect;
}

export function getBondsHonorLayout(sub: boolean): BondsHonorLayout {
    const width = sub ? 180 : 380;
    const height = BONDS_HONOR_HEIGHT;
    const scale = sub ? SUB_CHARACTER_SCALE : 1;
    const charaWidth = CHARACTER_WIDTH * scale;
    const charaHeight = CHARACTER_HEIGHT * scale;
    const charaY = height + (sub ? 0 : MAIN_CHARACTER_DROP) - charaHeight;

    return {
        width,
        height,
        leftBackground: { x: 0, y: 0, width: width / 2 + LEFT_BACKGROUND_OVERLAP, height },
        leftCharacter: { x: 0, y: charaY, width: charaWidth, height: charaHeight },
        rightCharacter: { x: width - charaWidth, y: charaY, width: charaWidth, height: charaHeight },
        leftCharacterClip: sub ? { x: 0, y: 0, width: SUB_CHARACTER_CLIP_WIDTH, height } : undefined,
        rightCharacterClip: sub
            ? { x: width - SUB_CHARACTER_CLIP_WIDTH, y: 0, width: SUB_CHARACTER_CLIP_WIDTH, height }
            : undefined,
        levelIcon: (index) => ({
            x: 50 + index * LEVEL_ICON_SIZE,
            y: height - LEVEL_ICON_SIZE,
            width: LEVEL_ICON_SIZE,
            height: LEVEL_ICON_SIZE,
        }),
    };
}
