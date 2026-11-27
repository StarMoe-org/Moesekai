/**
 * Player frame composition.
 *
 * The geometry below is the game client's own frame composition. Every ornament is a separate
 * sprite the client ships; they are placed in Unity's bottom-left coordinate space around a root
 * rect, the base sprite is nine-sliced over that rect, and the canvas grows to hold the parts that
 * stick out of it. Do not "tidy" the numbers here: they are the serialized values from the game
 * client, not calibrated guesses.
 *
 * Two families exist:
 * - `combination` (frame_0002, the newest World Link finale): six part slots, each slot can take
 *   any character's sprite, so the frame is user-editable.
 * - `single` (frame_0001, the earlier finale): one fixed frame per character and rank, with no
 *   part slots at all.
 *
 * This module deliberately has no imports so it can also be exercised by a plain node script.
 */

export type PlayerFrameOrientation = "vertical" | "horizontal";

/** `ranking` is the ranking-reward cell, `friend` the friend-list cell (only the centre piece moves). */
export type PlayerFrameVariant = "ranking" | "friend";

/** Which family a frame belongs to; see the module comment. */
export type PlayerFrameKind = "combination" | "single";

export const PLAYER_FRAME_PART_IDS = [1, 2, 3, 4, 5, 6] as const;
export type PlayerFramePartId = (typeof PLAYER_FRAME_PART_IDS)[number];

export const PLAYER_FRAME_PART_COUNT = PLAYER_FRAME_PART_IDS.length;

/** The base sprite, drawn under every ornament. */
const PLAYER_FRAME_BASE_PART = "frame_base";

interface FrameChildLayout {
    /** Asset file name without extension, e.g. `frame_parts3_right`. */
    readonly name: string;
    readonly anchorMin: readonly [number, number];
    readonly anchorMax: readonly [number, number];
    readonly position: readonly [number, number];
    readonly pivot: readonly [number, number];
}

interface FrameLayout {
    /** The rect the base sprite is stretched over, in game units. */
    readonly rootSize: readonly [number, number];
    /** Nine-slice border of the base sprite, in the client's order: left, bottom, right, top. */
    readonly border: readonly [number, number, number, number];
    /** Ornaments in draw order (bottom to top). */
    readonly children: readonly FrameChildLayout[];
    /** The top ornament that sits on the avatar in the friend-list cell instead of the ranking one. */
    readonly centreChild: string;
}

function child(
    name: string,
    anchor: readonly [number, number],
    position: readonly [number, number],
    pivot: readonly [number, number],
): FrameChildLayout {
    return { name, anchorMin: anchor, anchorMax: anchor, position, pivot };
}

const COMBINATION_LAYOUTS: Readonly<Record<PlayerFrameOrientation, FrameLayout>> = {
    // 340x748: the profile card.
    vertical: {
        rootSize: [340, 748],
        border: [50, 50, 50, 50],
        centreChild: "frame_parts1_center",
        children: [
            child("frame_parts5_right", [1, 0], [16, -8], [1, 0]),
            child("frame_parts4_left", [0, 0], [-16, -8], [0, 0]),
            child("frame_parts3_right", [1, 1], [16, 32], [1, 1]),
            child("frame_parts2_left", [0, 1], [-16, 32], [0, 1]),
            child("frame_parts1_left", [0, 1], [-16, 32], [0, 1]),
            child("frame_parts1_right", [1, 1], [16, 32], [1, 1]),
            child("frame_parts1_center", [0.5, 1], [0, 32], [0.5, 1]),
            child("frame_parts6_right", [1, 0], [16, -8], [1, 0]),
            child("frame_parts6_left", [0, 0], [-16, -8], [0, 0]),
        ],
    },
    // 1542x146: one friend-list / ranking cell.
    horizontal: {
        rootSize: [1542, 146],
        border: [21, 21, 21, 21],
        centreChild: "frame_parts1_center",
        children: [
            child("frame_parts5_bottom", [1, 0], [8, -8], [1, 0]),
            child("frame_parts3_bottom", [0, 0], [-8, -8], [0, 0]),
            child("frame_parts4_top", [1, 1], [8, 16], [1, 1]),
            child("frame_parts2_top", [0, 1], [-8, 16], [0, 1]),
            child("frame_parts1_top", [0, 1], [-8, 16], [0, 1]),
            child("frame_parts6_top", [1, 1], [8, 16], [1, 1]),
            child("frame_parts6_bottom", [1, 0], [8, -8], [1, 0]),
            child("frame_parts1_bottom", [0, 0], [-8, -8], [0, 0]),
            child("frame_parts1_center", [0, 1], [225, 16], [0, 1]),
        ],
    },
};

/** X of the centre piece in the friend-list cell variant (ranking uses the 225 above). */
const FRIEND_CENTRE_POSITION = 50;

/**
 * The single (non-editable) family: one base plus five ornaments, five slots instead of six
 * parts. The root rect and nine-slice border are shared with the combination family, and so is
 * the friend-list override of the centre ornament.
 */
const SINGLE_LAYOUTS: Readonly<Record<PlayerFrameOrientation, FrameLayout>> = {
    vertical: {
        rootSize: [340, 748],
        border: [50, 50, 50, 50],
        centreChild: "frame_centertop",
        children: [
            child("frame_lefttop", [0, 1], [-16, 32], [0, 1]),
            child("frame_righttop", [1, 1], [16, 32], [1, 1]),
            child("frame_centertop", [0.5, 1], [0, 32], [0.5, 1]),
            child("frame_leftbottom", [0, 0], [-16, -8], [0, 0]),
            child("frame_rightbottom", [1, 0], [16, -8], [1, 0]),
        ],
    },
    horizontal: {
        rootSize: [1542, 146],
        border: [21, 21, 21, 21],
        centreChild: "frame_centertop",
        children: [
            child("frame_lefttop", [0, 1], [-8, 16], [0, 1]),
            child("frame_righttop", [1, 1], [8, 16], [1, 1]),
            child("frame_leftbottom", [0, 0], [-8, -8], [0, 0]),
            child("frame_rightbottom", [1, 0], [8, -8], [1, 0]),
            child("frame_centertop", [0, 1], [225, 16], [0, 1]),
        ],
    },
};

function frameLayout(kind: PlayerFrameKind, orientation: PlayerFrameOrientation): FrameLayout {
    return kind === "single" ? SINGLE_LAYOUTS[orientation] : COMBINATION_LAYOUTS[orientation];
}

/** Every sprite file name of a frame, base first, in draw order. */
export function playerFramePartFileNames(kind: PlayerFrameKind, orientation: PlayerFrameOrientation): string[] {
    const layout = frameLayout(kind, orientation);
    return [PLAYER_FRAME_BASE_PART, ...layout.children.map(item => item.name)];
}

/** The part slot a sprite belongs to; the base is owned by part 1. */
export function playerFramePartId(fileName: string): PlayerFramePartId {
    const match = /^frame_parts([1-6])_/.exec(fileName);
    return match ? (Number(match[1]) as PlayerFramePartId) : 1;
}

/** The combination frame ships one full set of sprites per character, numbered from 20001. */
export function playerFrameSourceFrameId(characterId: number): number {
    return 20000 + Math.max(0, Math.trunc(characterId));
}

export interface PlayerFrameAssetRequest {
    readonly kind: PlayerFrameKind;
    /** The group's bundle, e.g. `frame_0001` / `frame_0002`. */
    readonly bundle: string;
    /** `playerFrames.json` id of the frame, e.g. 20001 (combination) or 10001 (single). */
    readonly frameId: number;
    readonly orientation: PlayerFrameOrientation;
    /** Combination frames only: part number -> character id; parts without an entry reuse part 1. */
    readonly characterIdByPart?: Readonly<Partial<Record<PlayerFramePartId, number>>>;
}

/**
 * Asset path (relative to the region's asset root) of every sprite of a frame.
 * The single family stores its sprites directly under the frame id, the combination family nests
 * a per-character source frame (`20000 + characterId`) under the rank frame id.
 */
export function playerFrameAssetPaths(request: PlayerFrameAssetRequest): Record<string, string> {
    const { kind, bundle, frameId, orientation } = request;
    const characterIdByPart = request.characterIdByPart ?? {};
    const fallback = characterIdByPart[1] ?? 0;
    const paths: Record<string, string> = {};
    for (const fileName of playerFramePartFileNames(kind, orientation)) {
        const segments = ["player_frame", bundle, String(frameId)];
        if (kind === "combination") {
            const characterId = characterIdByPart[playerFramePartId(fileName)] ?? fallback;
            segments.push(String(playerFrameSourceFrameId(characterId)));
        }
        segments.push(orientation, `${fileName}.png`);
        paths[fileName] = segments.join("/");
    }
    return paths;
}

export interface PlayerFrameSize {
    readonly width: number;
    readonly height: number;
}

export interface PlayerFramePlacement extends PlayerFrameSize {
    readonly name: string;
    readonly x: number;
    readonly y: number;
}

export interface PlayerFrameComposition {
    readonly orientation: PlayerFrameOrientation;
    readonly width: number;
    readonly height: number;
    /** Where the frame's own rect landed on the canvas: x1, y1, x2, y2 in top-left pixels. */
    readonly rootBox: readonly [number, number, number, number];
    readonly border: readonly [number, number, number, number];
    /** Ornaments in draw order, already in top-left canvas pixels. */
    readonly placements: readonly PlayerFramePlacement[];
}

/** Halves round to even (banker's rounding), so the placements land on the client's own pixels. */
function roundHalfEven(value: number): number {
    const floor = Math.floor(value);
    const fraction = value - floor;
    if (fraction > 0.5) return floor + 1;
    if (fraction < 0.5) return floor;
    return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Places every ornament of a frame on a canvas large enough to hold the overhang.
 * `sizes` must carry the natural pixel size of each sprite (see {@link playerFramePartFileNames}).
 */
export function computePlayerFrameComposition(
    kind: PlayerFrameKind,
    orientation: PlayerFrameOrientation,
    sizes: Readonly<Record<string, PlayerFrameSize>>,
    variant: PlayerFrameVariant = "ranking",
): PlayerFrameComposition | null {
    const layout = frameLayout(kind, orientation);
    if (!layout) return null;
    const [rootWidth, rootHeight] = layout.rootSize;

    const placements: PlayerFramePlacement[] = [];
    const bounds = [0, 0, rootWidth, rootHeight];
    for (const item of layout.children) {
        const size = sizes[item.name];
        if (!size) return null;
        const anchorX = rootWidth * (item.anchorMin[0] + (item.anchorMax[0] - item.anchorMin[0]) * item.pivot[0]);
        const anchorY = rootHeight * (item.anchorMin[1] + (item.anchorMax[1] - item.anchorMin[1]) * item.pivot[1]);
        const positionX =
            orientation === "horizontal" && variant === "friend" && item.name === layout.centreChild
                ? FRIEND_CENTRE_POSITION
                : item.position[0];
        const x = roundHalfEven(anchorX + positionX - item.pivot[0] * size.width);
        const y = roundHalfEven(anchorY + item.position[1] - item.pivot[1] * size.height);
        placements.push({ name: item.name, x, y, width: size.width, height: size.height });
        bounds[0] = Math.min(bounds[0], x);
        bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x + size.width);
        bounds[3] = Math.max(bounds[3], y + size.height);
    }

    const [minX, minY, maxX, maxY] = bounds;
    return {
        orientation,
        width: maxX - minX,
        height: maxY - minY,
        rootBox: [-minX, maxY - rootHeight, rootWidth - minX, maxY],
        border: layout.border,
        // Unity's origin is bottom-left, the canvas origin is top-left.
        placements: placements.map(item => ({
            ...item,
            x: item.x - minX,
            y: maxY - (item.y + item.height),
        })),
    };
}

export interface PlayerFrameBox extends PlayerFrameSize {
    readonly x: number;
    readonly y: number;
}

/** A serialized cell box: left, top, width, height in game units. */
type CellBox = readonly [number, number, number, number];

/**
 * One preview cell: the client's serialized layout for the card the frame wraps. Every number is
 * the client's own, in cell pixels, for the portrait cell (MultiLiveMatchingRoomPlayerCell) and the
 * friend row (FriendListCell).
 */
export interface PlayerFrameCell {
    /** `_VERTICAL_CELL_SIZE` / `_FRAME_PREVIEW_SIZE`. */
    readonly size: readonly [number, number];
    /** `_VERTICAL_CONTENT_BOTTOM`: lowest content edge, which caps the output height. */
    readonly contentBottom: number;
    /** `_FRAME_PREVIEW_SCALE`. */
    readonly scale: number;
    /** Mask/Base body box and radius. */
    readonly body: CellBox;
    readonly bodyRadius: number;
    /** `_VERTICAL_CARD_BOX`: the card art rect (the row uses `cardVisual` instead). */
    readonly card: CellBox | null;
    /** Mask (1): clips the index colour only. */
    readonly overlay: CellBox | null;
    /** `_VERTICAL_PARAM_BOX`: the level bar. */
    readonly param: CellBox;
    readonly levelText: CellBox;
    readonly attribute: CellBox;
    readonly rarityOrigin: readonly [number, number];
    readonly raritySize: number;
    readonly rarityStep: number;
    readonly masterRank: CellBox | null;
    /** Base (1): the lower info panel. */
    readonly panel: CellBox | null;
    readonly name: CellBox;
    readonly honors: readonly CellBox[];
    /**
     * `_FRIEND_HONOR_ROOT × _FRIEND_HONOR_PARENT_SCALE`: the friend row draws each honor at this
     * fixed size centred on its anchor box instead of fitting inside it.
     */
    readonly honorRoots: readonly (readonly [number, number, number])[] | null;
    /** PlayerFrameCell: the box the composed frame's root rect is fitted onto. */
    readonly frame: CellBox;
    readonly indexColor: CellBox | null;
    /** `_FRIEND_CARD_BOX`: the S-size card visual of the friend row. */
    readonly cardVisual: CellBox | null;
    readonly comment: CellBox | null;
    readonly status: CellBox | null;
    readonly statusRadius: number;
    readonly fontSizes: { readonly name: number; readonly level: number };
}

/** `_VERTICAL_COLOURS`, alpha included. */
const VERTICAL_COLOURS = {
    body: [235, 235, 242, 230] as const,
    levelPlate: [235, 235, 242, 115] as const,
    panel: [235, 235, 242, 255] as const,
    name: [85, 85, 119, 255] as const,
    levelText: [255, 255, 255, 255] as const,
    levelOutline: [68, 68, 102, 76] as const,
    indexColor: [255, 85, 119, 255] as const,
};

/** `_FRIEND_COLOURS`. */
const FRIEND_COLOURS = {
    name: [85, 85, 119, 255] as const,
    commentPlate: [223, 223, 234, 255] as const,
    statusPlate: [136, 136, 170, 255] as const,
};


/** The plate the S-size card sits on inside the friend row: the row's own plate colour, opaque. */
const FRIEND_CARD_PLATE = [246, 247, 251, 255] as const;
/** Fill of the level bar of an S-size card visual. */
const FRIEND_CARD_LEVEL_PLATE = [70, 70, 100, 255] as const;
/** Height of that bar, in the 152px card base. */
const FRIEND_CARD_BAR_HEIGHT = 24;

/** `_VERTICAL_LEVEL_OUTLINE_UNITS`. */
const LEVEL_OUTLINE_UNITS = 2.6;

export const PLAYER_FRAME_CELLS: Readonly<Record<PlayerFrameOrientation, PlayerFrameCell>> = {
    vertical: {
        size: [368, 784],
        contentBottom: 766.2,
        scale: 2,
        body: [17, 20, 334, 744],
        bodyRadius: 52,
        card: [15, 20, 338, 502],
        overlay: [16, 20, 336, 744],
        param: [15, 475.8, 338, 48],
        levelText: [26.8, 480.7, 219, 40],
        attribute: [23, 20, 64, 68],
        rarityOrigin: [25.3, 428],
        raritySize: 40,
        rarityStep: 40,
        masterRank: [277, 450, 72, 72],
        panel: [16, 522.3, 336, 241.68],
        name: [27, 527.15, 314, 58.85],
        honors: [
            [31.53, 593.7, 304, 64],
            [32, 666, 144, 64],
            [192, 666, 144, 64],
        ],
        honorRoots: null,
        frame: [14, 18, 340, 748],
        indexColor: [231.05, 746.5, 64.1, 19.72],
        cardVisual: null,
        comment: null,
        status: null,
        statusRadius: 0,
        fontSizes: { name: 28, level: 28 },
    },
    horizontal: {
        size: [1552, 168],
        contentBottom: 168,
        scale: 2,
        body: [4, 12, 1536, 144],
        bodyRadius: 21,
        card: null,
        overlay: null,
        param: [24, 117.12, 112.32, 23.04],
        levelText: [30.84, 116.31, 76.32, 19.44],
        attribute: [25.44, 27.84, 24.65, 26.18],
        rarityOrigin: [27.12, 100.03],
        raritySize: 15.84,
        rarityStep: 15.84,
        masterRank: [97.44, 101.28, 38.88, 38.88],
        panel: null,
        name: [150, 26, 500, 36],
        honors: [
            [179, 82.8, 243.2, 51.2],
            [478, 82.8, 115.2, 51.2],
            [633, 82.8, 115.2, 51.2],
        ],
        honorRoots: [
            [380, 80, 0.8],
            [180, 80, 0.8],
            [180, 80, 0.8],
        ],
        frame: [3, 11, 1542, 146],
        indexColor: null,
        cardVisual: [24, 27.84, 112.32, 112.32],
        comment: [780, 28, 432, 112],
        status: [1257, 60, 240, 48],
        statusRadius: 16,
        fontSizes: { name: 36, level: 17.28 },
    },
};

export interface PlayerFrameCellFrame {
    /** Top-left of the frame image in output pixels. */
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** The output canvas and where the composed frame lands on it. */
export interface PlayerFrameCellCanvas {
    readonly width: number;
    readonly height: number;
    /** Offset added to every scaled cell coordinate. */
    readonly offsetX: number;
    readonly offsetY: number;
}

/**
 * The output canvas, assembled the way the game does it: the frame's root rect is fitted per axis
 * onto the cell's frame box, and the canvas is the union of the cell content and the placed frame —
 * the friend row additionally keeps its 100/80 padding around the cell.
 */
export function playerFrameCellCanvas(
    composition: PlayerFrameComposition,
    cell: PlayerFrameCell,
): PlayerFrameCellCanvas {
    const scale = cell.scale;
    const cellWidth = Math.round(cell.size[0] * scale);
    const cellHeight = Math.round(cell.size[1] * scale);
    const frameWidth = Math.round(cell.frame[2] * scale);
    const frameHeight = Math.round(cell.frame[3] * scale);
    // rootBox is (x1, y1, x2, y2): the root rect the base sprite was stretched over.
    const [rootX, rootY, rootRight, rootBottom] = composition.rootBox;
    const rootWidth = rootRight - rootX;
    const rootHeight = rootBottom - rootY;
    const factorX = frameWidth / Math.max(1e-6, rootWidth);
    const factorY = frameHeight / Math.max(1e-6, rootHeight);
    const frameX = Math.round(cell.frame[0] * scale - rootX * factorX);
    const frameY = Math.round(cell.frame[1] * scale - rootY * factorY);
    const placedWidth = Math.round(composition.width * factorX);
    const placedHeight = Math.round(composition.height * factorY);

    if (composition.orientation === "vertical") {
        const contentBottom = Math.round(cell.contentBottom * scale);
        const left = Math.min(0, frameX);
        const top = Math.min(0, frameY);
        const right = Math.max(cellWidth, frameX + placedWidth);
        const bottom = Math.max(contentBottom, frameY + placedHeight);
        return { width: right - left, height: bottom - top, offsetX: -left, offsetY: -top };
    }

    const left = Math.max(100, -frameX);
    const top = Math.max(80, -frameY);
    const right = Math.max(100, frameX + placedWidth - cellWidth);
    const bottom = Math.max(80, frameY + placedHeight - cellHeight);
    return { width: cellWidth + left + right, height: cellHeight + top + bottom, offsetX: left, offsetY: top };
}

/** One honor slot: the degree art with the rarity frame drawn over it. */
export interface PlayerFrameHonorArt {
    readonly background: CanvasImageSource | null;
    /**
     * A character honor's word art (380x80, the whole main canvas), laid over the background and
     * under the frame. `honorWords`/`honorBackgrounds` split what used to be one sprite into a
     * background style plus a word, so a player can pick both.
     */
    readonly word?: CanvasImageSource | null;
    readonly frame: CanvasImageSource | null;
    /**
     * A placement plate pasted over the framed badge: a rank-match honor's tier (`MASTER RANK`, …)
     * or an event title's own ranking plate. The game pastes it at its native sprite size, so
     * `box` is its position in fractions of the honor art and it scales with whatever size the cell
     * draws the honor at. A plate that is the badge's own canvas covers it completely.
     */
    readonly overlay?: {
        readonly image: CanvasImageSource;
        readonly box: readonly [number, number, number, number];
    } | null;
    /**
     * The honor's level: a birthday title prints one flower per level along the bottom edge, the
     * other families a row of star badges. `count` is the level; the offsets below live in the
     * 380x80 / 180x80 art canvas the badge is drawn on.
     */
    readonly levelBadge?: PlayerFrameHonorLevelBadge | null;
    /**
     * The count an FC/AP honor writes on its scroll plate — how many songs of that difficulty the
     * player has FC'd or AP'd. The anchor comes from `honorFcapTextAnchor` so this canvas and
     * `DegreeImage` write the number in the same place.
     */
    readonly fcapCount?: PlayerFrameHonorFcapCount | null;
    /**
     * A character title's oshi-style medal, drawn over everything else. Same fractional-box shape as
     * `overlay`; the anchor and native size come from `HONOR_MEDAL_ART` in `honor-art.ts`.
     */
    readonly medal?: {
        readonly image: CanvasImageSource;
        readonly box: readonly [number, number, number, number];
    } | null;
}

/** The FC/AP count of one honor slot, with the anchor it is written at. */
export interface PlayerFrameHonorFcapCount {
    readonly value: number;
    /** Digits' horizontal centre and their alphabetic baseline, in the art canvas below. */
    readonly x: number;
    readonly baselineY: number;
    readonly fontSize: number;
    /** The honor art canvas those offsets are expressed in: 380x80 main, 180x80 sub. */
    readonly artWidth: number;
    readonly artHeight: number;
}

/** The level badge of one honor slot, already loaded. */
export interface PlayerFrameHonorLevelBadge {
    readonly kind: "flower" | "star";
    readonly count: number;
    readonly image: CanvasImageSource | null;
    /** The 6+ star sprite; stars past the fifth use it. */
    readonly imageSix?: CanvasImageSource | null;
    /** The honor art canvas the offsets below are expressed in: 380x80 main, 180x80 sub. */
    readonly artWidth: number;
    readonly artHeight: number;
}

/** The game art the card is built from; every piece is optional and skipped when missing. */
export interface PlayerFrameCardArt {
    /** The card illustration (cover-fitted into the card rect / card visual). */
    readonly illustration?: CanvasImageSource | null;
    /** The S-size card frame (`frame_rarity_*`) of the friend row's card visual. */
    readonly cardFrame?: CanvasImageSource | null;
    /** Attribute badge (`icon_attribute_*_64`). */
    readonly attribute?: CanvasImageSource | null;
    /** One rarity mark, repeated `rarityCount` times. */
    readonly star?: CanvasImageSource | null;
    readonly rarityCount?: number;
    /** Master rank badge (`train_rank_*`). */
    readonly masterRank?: CanvasImageSource | null;
    /** Honor art per slot, main first. */
    readonly honors?: readonly (PlayerFrameHonorArt | null)[] | null;
    /** Pre-formatted level text, e.g. `Lv.60`. */
    readonly levelLabel?: string | null;
    /** The name printed on the card. */
    readonly name?: string | null;
    /** The client's text font family once loaded; falls back to the page stack. */
    readonly fontFamily?: string | null;
}

export interface PlayerFrameDrawOptions {
    readonly composition: PlayerFrameComposition;
    /** The cell the frame is drawn into (portrait card or friend row). */
    readonly cell: PlayerFrameCell;
    /** Sprites by file name; the base sprite's natural size drives the nine-slice. */
    readonly images: ReadonlyMap<string, { readonly image: CanvasImageSource; readonly width: number; readonly height: number }>;
    /** Card art; pass null for the bare frame. */
    readonly card?: PlayerFrameCardArt | null;
    /** Draw the decorative frame over the card; off keeps the card, its art, name and honors. */
    readonly showFrame?: boolean;
    /** Output pixel size, as returned by {@link playerFrameCellCanvas}. */
    readonly canvas: PlayerFrameCellCanvas;
}

/**
 * Fallback faces for the card text. The client's own font (loaded by the page as `SekaiCardFont`)
 * only covers Japanese; a simplified name mixes in glyphs it does not have, so a CJK face has to
 * come next — otherwise the browser picks an arbitrary font per glyph and the text looks stitched
 * together. The page passes the whole stack it wants through `PlayerFrameCardArt.fontFamily`.
 */
const DEFAULT_FONT_STACK =
    '"Roboto Flex", "Segoe UI", "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif';

function rgba(color: readonly number[]): string {
    const alpha = color.length >= 4 ? color[3] / 255 : 1;
    return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function spriteWidth(image: CanvasImageSource): number {
    const candidate = image as { naturalWidth?: number; width?: number };
    return Number(candidate.naturalWidth ?? candidate.width ?? 1) || 1;
}

function spriteHeight(image: CanvasImageSource): number {
    const candidate = image as { naturalHeight?: number; height?: number };
    return Number(candidate.naturalHeight ?? candidate.height ?? 1) || 1;
}

/** A serialized box in output pixels. */
function scaled(box: CellBox, scale: number): CellBox {
    return [box[0] * scale, box[1] * scale, box[2] * scale, box[3] * scale];
}

function roundRectPath(context: CanvasRenderingContext2D, box: CellBox, radius: number): void {
    const [x, y, width, height] = box;
    const safe = Math.max(0, Math.min(radius, width / 2, height / 2));
    context.beginPath();
    context.moveTo(x + safe, y);
    context.arcTo(x + width, y, x + width, y + height, safe);
    context.arcTo(x + width, y + height, x, y + height, safe);
    context.arcTo(x, y + height, x, y, safe);
    context.arcTo(x, y, x + width, y, safe);
    context.closePath();
}

function fillBox(context: CanvasRenderingContext2D, box: CellBox, color: readonly number[]): void {
    context.fillStyle = rgba(color);
    context.fillRect(box[0], box[1], box[2], box[3]);
}

/** `_preview_paste_inside`: contain-fit, centred in the box. */
function drawContained(context: CanvasRenderingContext2D, image: CanvasImageSource, box: CellBox): void {
    const [x, y, width, height] = box;
    const factor = Math.min(width / spriteWidth(image), height / spriteHeight(image));
    const w = Math.max(1, Math.round(spriteWidth(image) * factor));
    const h = Math.max(1, Math.round(spriteHeight(image) * factor));
    context.drawImage(image, x + Math.round((width - w) / 2), y + Math.round((height - h) / 2), w, h);
}

/**
 * A placement plate over a framed honor: the game pastes it at its native size, so the fractional
 * box is mapped onto the badge box as it is (no contain-fit, which would rescale it).
 */
function drawHonorOverlay(
    context: CanvasRenderingContext2D,
    overlay: NonNullable<PlayerFrameHonorArt["overlay"]>,
    box: CellBox,
): void {
    const [x, y, width, height] = box;
    const [fx, fy, fw, fh] = overlay.box;
    context.drawImage(overlay.image, x + fx * width, y + fy * height, fw * width, fh * height);
}

/**
 * The honor's level badge, in the honor art's own 380x80 / 180x80 canvas mapped onto the box the cell
 * gives the badge. A birthday title places one flower per level along the bottom edge, the star
 * families a row of 16px badges from (50, 64) — the same offsets `DegreeImage` draws.
 */
function drawHonorLevelBadge(
    context: CanvasRenderingContext2D,
    badge: PlayerFrameHonorLevelBadge,
    box: CellBox,
): void {
    if (badge.count <= 0) return;
    if (badge.kind === "flower" && !badge.image) return;
    if (badge.kind === "star" && !badge.image && !badge.imageSix) return;
    const artWidth = Math.max(1, badge.artWidth);
    const artHeight = Math.max(1, badge.artHeight);
    // The badge art is contain-fitted onto the box, so the offsets scale with that fit.
    const factor = Math.min(box[2] / artWidth, box[3] / artHeight);
    const left = box[0] + (box[2] - artWidth * factor) / 2;
    const top = box[1] + (box[3] - artHeight * factor) / 2;
    if (badge.kind === "flower") {
        const size = 18 * factor;
        const y = top + (artHeight - 18) * factor;
        const startX = left + (artWidth / 2 - 9 * badge.count) * factor;
        for (let index = 0; index < badge.count; index += 1) {
            context.drawImage(badge.image!, startX + index * 18 * factor, y, size, size);
        }
        return;
    }
    const size = 16 * factor;
    const y = top + 64 * factor;
    const drawStars = (image: CanvasImageSource, count: number): void => {
        for (let index = 0; index < count; index += 1) {
            context.drawImage(image, left + (50 + index * 16) * factor, y, size, size);
        }
    };
    if (badge.image) drawStars(badge.image, Math.min(5, badge.count));
    if (badge.imageSix && badge.count > 5) drawStars(badge.imageSix, badge.count - 5);
}

/**
 * The FC/AP count on an honor's scroll plate: white bold digits centred on the ribbon, mapped from
 * the art canvas onto the box the cell gives the badge. `anchor` is `honorFcapTextAnchor`'s output
 * for this slot, so the number lands where `DegreeImage` puts it.
 */
function drawHonorFcapCount(
    context: CanvasRenderingContext2D,
    anchor: PlayerFrameHonorFcapCount,
    box: CellBox,
    fontStack: string,
): void {
    if (!Number.isFinite(anchor.value)) return;
    const artWidth = Math.max(1, anchor.artWidth);
    const artHeight = Math.max(1, anchor.artHeight);
    // The badge art is contain-fitted onto the box, so the offsets scale with that fit.
    const factor = Math.min(box[2] / artWidth, box[3] / artHeight);
    const left = box[0] + (box[2] - artWidth * factor) / 2;
    const top = box[1] + (box[3] - artHeight * factor) / 2;
    context.save();
    context.font = `700 ${anchor.fontSize * factor}px ${fontStack}`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillStyle = "rgb(255, 255, 255)";
    context.fillText(String(anchor.value), left + anchor.x * factor, top + anchor.baselineY * factor);
    context.restore();
}

/** `_card_visual_fit_cover`: fill the box, cropped, anchored to the top centre. */
function drawCover(context: CanvasRenderingContext2D, image: CanvasImageSource, box: CellBox): void {
    const [x, y, width, height] = box;
    const factor = Math.max(width / spriteWidth(image), height / spriteHeight(image));
    const w = Math.max(1, Math.round(spriteWidth(image) * factor));
    const h = Math.max(1, Math.round(spriteHeight(image) * factor));
    context.drawImage(image, x + Math.round((width - w) / 2), y, w, h);
}

/**
 * The friend row's avatar: the shared S-size card visual goes here — art, level bar, card frame,
 * master rank, attribute and rarity marks — scaled into the avatar box. Positions are in the
 * client's 152x152 card base.
 */
function drawCardVisual(context: CanvasRenderingContext2D, art: PlayerFrameCardArt, box: CellBox, fontStack: string): void {
    const [x, y, width, height] = box;
    const unitX = width / 152;
    const unitY = height / 152;
    const at = (bx: number, by: number, bw: number, bh: number): CellBox => [
        x + bx * unitX,
        y + by * unitY,
        bw * unitX,
        bh * unitY,
    ];

    // The card is a rounded plate that sits on the row: clipping to that rounded box and painting the
    // plate colour first makes every pixel of the card opaque, so a viewer never turns the card's
    // anti-aliased corner into a black dot — and the corners stay round instead of square.
    context.save();
    roundRectPath(context, [x, y, width, height], (10 / 152) * width);
    context.clip();
    fillBox(context, [x, y, width, height], FRIEND_CARD_PLATE);

    if (art.illustration) drawCover(context, art.illustration, [x, y, width, height]);
    if (art.levelLabel) {
        fillBox(context, at(0, 152 - FRIEND_CARD_BAR_HEIGHT, 152, FRIEND_CARD_BAR_HEIGHT), FRIEND_CARD_LEVEL_PLATE);
        context.save();
        context.font = `700 ${16 * unitY}px ${fontStack}`;
        context.textBaseline = "middle";
        context.fillStyle = "rgb(255, 255, 255)";
        context.fillText(art.levelLabel, x + 6 * unitX, y + 140 * unitY - 4 * unitY);
        context.restore();
    }
    if (art.cardFrame) drawContained(context, art.cardFrame, [x, y, width, height]);
    if (art.masterRank) drawContained(context, art.masterRank, at(98, 98, 54, 54));
    if (art.attribute) drawContained(context, art.attribute, at(2, 0, 34, 36));
    if (art.star) {
        for (let index = 0; index < (art.rarityCount ?? 0); index += 1) {
            drawContained(context, art.star, at(6 + index * 22, 102, 22, 22));
        }
    }
    context.restore();
}

/** `_preview_draw_outlined_text`: an outward ring first, then the face. */
function drawOutlinedText(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    font: string,
    face: readonly number[],
    ring: readonly number[],
    ringWidth: number,
): void {
    context.save();
    context.font = font;
    context.textBaseline = "middle";
    context.lineJoin = "round";
    if (ringWidth > 0 && ring[3] > 0) {
        context.strokeStyle = rgba([ring[0], ring[1], ring[2], 255]);
        context.globalAlpha = ring[3] / 255;
        context.lineWidth = ringWidth * 2;
        context.strokeText(text, x, y);
        context.globalAlpha = 1;
    }
    context.fillStyle = rgba(face);
    context.fillText(text, x, y);
    context.restore();
}

/** The grey of an unset honor slot. */
const EMPTY_HONOR_SLOT_COLOUR = [176, 188, 200, 255] as const;

/** An empty honor slot: the client always shows the slot, even when no title is set. */
function drawEmptyHonorSlot(context: CanvasRenderingContext2D, box: CellBox, scale: number): void {
    // The client draws its `honor/bg_base_round_h80_wh` plate tinted grey, so an unset slot reads
    // as a grey pill instead of a white one.
    roundRectPath(context, box, box[3] / 2);
    context.fillStyle = rgba(EMPTY_HONOR_SLOT_COLOUR);
    context.fill();
    context.strokeStyle = "rgba(132, 142, 176, 0.45)";
    context.lineWidth = 1.6 * scale;
    context.stroke();
}

/**
 * Draws one composed frame inside its cell, for the portrait card and for the friend row, in the
 * client's own order: body plate → card → card info → panel/name/honors → frame → index colour,
 * with every branch clipped by the client's masks.
 */
export function drawPlayerFrame(context: CanvasRenderingContext2D, options: PlayerFrameDrawOptions): void {
    const { composition, cell, images, canvas } = options;
    const art = options.card ?? null;
    const scale = cell.scale;
    // `fontFamily` is a whole CSS font stack, picked by the page's UI language.
    const fontStack = art?.fontFamily?.trim() ? art.fontFamily : DEFAULT_FONT_STACK;
    const body = scaled(cell.body, scale);
    const radius = cell.bodyRadius * scale;

    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.translate(canvas.offsetX, canvas.offsetY);

    if (composition.orientation === "vertical") {
        // 1) Mask/Base: the body plate (nine-sliced bg_base_r48_wh = a rounded 52 rect).
        roundRectPath(context, body, radius);
        context.fillStyle = rgba(VERTICAL_COLOURS.body);
        context.fill();

        // 2) Card art: clipped by the card rect, then the rounded body.
        if (art?.illustration && cell.card) {
            context.save();
            roundRectPath(context, body, radius);
            context.clip();
            context.beginPath();
            const card = scaled(cell.card, scale);
            context.rect(card[0], card[1], card[2], card[3]);
            context.clip();
            drawCover(context, art.illustration, card);
            context.restore();
        }

        // 3) Card info, same masks: level bar, level text, attribute, rarity marks, master rank.
        context.save();
        roundRectPath(context, body, radius);
        context.clip();
        context.beginPath();
        if (cell.card) {
            const card = scaled(cell.card, scale);
            context.rect(card[0], card[1], card[2], card[3]);
            context.clip();
        }
        fillBox(context, scaled(cell.param, scale), VERTICAL_COLOURS.levelPlate);
        if (art?.levelLabel) {
            const textBox = scaled(cell.levelText, scale);
            drawOutlinedText(
                context,
                textBox[0],
                textBox[1] + textBox[3] / 2,
                art.levelLabel,
                `700 ${cell.fontSizes.level * scale}px ${fontStack}`,
                VERTICAL_COLOURS.levelText,
                VERTICAL_COLOURS.levelOutline,
                LEVEL_OUTLINE_UNITS * scale,
            );
        }
        if (art?.attribute) drawContained(context, art.attribute, scaled(cell.attribute, scale));
        if (art?.star) {
            for (let index = 0; index < (art.rarityCount ?? 0); index += 1) {
                const size = cell.raritySize * scale;
                drawContained(context, art.star, [
                    (cell.rarityOrigin[0] + cell.rarityStep * index) * scale,
                    cell.rarityOrigin[1] * scale,
                    size,
                    size,
                ]);
            }
        }
        if (art?.masterRank && cell.masterRank) drawContained(context, art.masterRank, scaled(cell.masterRank, scale));
        context.restore();

        // 4) Lower panel, name and honors, clipped by the rounded body only.
        context.save();
        roundRectPath(context, body, radius);
        context.clip();
        if (cell.panel) fillBox(context, scaled(cell.panel, scale), VERTICAL_COLOURS.panel);
        if (art?.name) {
            const nameBox = scaled(cell.name, scale);
            context.save();
            context.font = `700 ${cell.fontSizes.name * scale}px ${fontStack}`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillStyle = rgba(VERTICAL_COLOURS.name);
            context.fillText(art.name, nameBox[0] + nameBox[2] / 2, nameBox[1] + nameBox[3] / 2);
            context.restore();
        }
        cell.honors.forEach((honorBox, index) => {
            const honor = art?.honors?.[index] ?? null;
            const target = scaled(honorBox, scale);
            if (!honor) {
                drawEmptyHonorSlot(context, target, scale);
                return;
            }
            if (honor.background) drawContained(context, honor.background, target);
            if (honor.word) drawContained(context, honor.word, target);
            if (honor.frame) drawContained(context, honor.frame, target);
            if (honor.levelBadge) drawHonorLevelBadge(context, honor.levelBadge, target);
            if (honor.overlay) drawHonorOverlay(context, honor.overlay, target);
            if (honor.fcapCount) drawHonorFcapCount(context, honor.fcapCount, target, fontStack);
            if (honor.medal) drawHonorOverlay(context, honor.medal, target);
        });
        context.restore();
    } else {
        // Friend row: the plate with its shadow, then card visual → honors → comment → name.
        // The online-status plate is skipped on purpose: the profile API carries no status here.
        context.save();
        context.shadowColor = "rgba(24, 30, 52, 0.20)";
        context.shadowBlur = 14 * scale;
        context.shadowOffsetY = 2 * scale;
        roundRectPath(context, body, radius);
        // Opaque: the card art is rounded and those corners must reveal this plate, not a half-
            // transparent pixel that a viewer composites onto black.
            context.fillStyle = "rgb(246, 247, 251)";
        context.fill();
        context.restore();
        if (cell.cardVisual && art) drawCardVisual(context, art, scaled(cell.cardVisual, scale), fontStack);
        cell.honors.forEach((honorBox, index) => {
            const honor = art?.honors?.[index] ?? null;
            const target = scaled(honorBox, scale);
            // `_FRIEND_HONOR_ROOT × _FRIEND_HONOR_PARENT_SCALE`, centred on the anchor box; the
            // empty slot uses the same box so the placeholders line up with real titles.
            const root = cell.honorRoots?.[index] ?? null;
            const box: CellBox = root
                ? [
                      target[0] + target[2] / 2 - (root[0] * root[2] * scale) / 2,
                      target[1] + target[3] / 2 - (root[1] * root[2] * scale) / 2,
                      root[0] * root[2] * scale,
                      root[1] * root[2] * scale,
                  ]
                : target;
            if (!honor) {
                drawEmptyHonorSlot(context, box, scale);
                return;
            }
            if (honor.background) drawContained(context, honor.background, box);
            if (honor.word) drawContained(context, honor.word, box);
            if (honor.frame) drawContained(context, honor.frame, box);
            if (honor.levelBadge) drawHonorLevelBadge(context, honor.levelBadge, box);
            if (honor.overlay) drawHonorOverlay(context, honor.overlay, box);
            if (honor.fcapCount) drawHonorFcapCount(context, honor.fcapCount, box, fontStack);
            if (honor.medal) drawHonorOverlay(context, honor.medal, box);
        });
        if (cell.comment) {
            roundRectPath(context, scaled(cell.comment, scale), 21 * scale);
            context.fillStyle = rgba(FRIEND_COLOURS.commentPlate);
            context.fill();
        }
        if (art?.name) {
            const nameBox = scaled(cell.name, scale);
            context.save();
            context.font = `700 ${cell.fontSizes.name * scale}px ${fontStack}`;
            context.textBaseline = "middle";
            context.fillStyle = rgba(FRIEND_COLOURS.name);
            context.fillText(art.name, nameBox[0], nameBox[1] + nameBox[3] / 2);
            context.restore();
        }
    }

    // 5) The frame, fitted per axis onto the cell's frame box.
    if (options.showFrame !== false) drawFrameIntoCell(context, composition, images, cell, scale);

    // 6) Index colour: the client's last sibling, drawn above the frame, clipped by Mask (1).
    //    It carries the frame's own colour, so it goes with the frame when that is hidden.
    if (options.showFrame !== false && cell.indexColor && cell.overlay) {
        context.save();
        roundRectPath(context, scaled(cell.overlay, scale), radius);
        context.clip();
        fillBox(context, scaled(cell.indexColor, scale), VERTICAL_COLOURS.indexColor);
        context.restore();
    }

    context.restore();
}

/** Composites the composed frame so its root rect lands exactly on the cell's frame box. */
function drawFrameIntoCell(
    context: CanvasRenderingContext2D,
    composition: PlayerFrameComposition,
    images: PlayerFrameDrawOptions["images"],
    cell: PlayerFrameCell,
    scale: number,
): void {
    const [frameX, frameY, frameWidth, frameHeight] = scaled(cell.frame, scale);
    const [rootX, rootY, rootRight, rootBottom] = composition.rootBox;
    const rootWidth = rootRight - rootX;
    const rootHeight = rootBottom - rootY;
    const factorX = frameWidth / Math.max(1e-6, rootWidth);
    const factorY = frameHeight / Math.max(1e-6, rootHeight);

    context.save();
    context.translate(frameX - rootX * factorX, frameY - rootY * factorY);
    context.scale(factorX, factorY);

    const base = images.get(PLAYER_FRAME_BASE_PART);
    if (base) {
        drawNineSlice(
            context,
            base.image,
            { width: base.width, height: base.height },
            { x: rootX, y: rootY, width: rootWidth, height: rootHeight },
            composition.border,
        );
    }
    for (const placement of composition.placements) {
        const part = images.get(placement.name);
        if (!part) continue;
        context.drawImage(part.image, placement.x, placement.y, placement.width, placement.height);
    }
    context.restore();
}

/**
 * Draws one sprite nine-sliced into `box`, the way the client stretches `frame_base`.
 * `border` is in the client's order (left, bottom, right, top); the corners keep their source size.
 */
function drawNineSlice(
    context: CanvasRenderingContext2D,
    image: CanvasImageSource,
    source: PlayerFrameSize,
    box: PlayerFrameBox,
    border: readonly [number, number, number, number],
): void {
    const [left, bottom, right, top] = border;
    const columns: [number, number][] = [
        [0, left],
        [left, Math.max(left, source.width - right)],
        [Math.max(left, source.width - right), source.width],
    ];
    const rows: [number, number][] = [
        [0, bottom],
        [bottom, Math.max(bottom, source.height - top)],
        [Math.max(bottom, source.height - top), source.height],
    ];
    const targetsX: [number, number][] = [
        [box.x, box.x + left],
        [box.x + left, box.x + box.width - right],
        [box.x + box.width - right, box.x + box.width],
    ];
    const targetsY: [number, number][] = [
        [box.y, box.y + top],
        [box.y + top, box.y + top + (box.height - top - bottom)],
        [box.y + box.height - bottom, box.y + box.height],
    ];
    for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
            const sourceWidth = columns[column][1] - columns[column][0];
            const sourceHeight = rows[row][1] - rows[row][0];
            const targetWidth = targetsX[column][1] - targetsX[column][0];
            const targetHeight = targetsY[row][1] - targetsY[row][0];
            if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) continue;
            context.drawImage(
                image,
                columns[column][0],
                rows[row][0],
                sourceWidth,
                sourceHeight,
                targetsX[column][0],
                targetsY[row][0],
                targetWidth,
                targetHeight,
            );
        }
    }
}
