"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import {
    Button,
    Dialog,
    ErrorState,
    Icon,
    IconButton,
    LoadingState,
    PageContainer,
    PageHeader,
    SectionCard,
    SegmentedButton,
    Slider,
    Snackbar,
    Surface,
    Switch,
    TextField,
    cn,
} from "@/components/md3";
import { mdCheck, mdDownload, mdEdit, mdPerson, mdRestartAlt, mdShuffle, mdTune } from "@/components/md3/icons";
import { FilterSection, getFilterChipStateClasses } from "@/components/common/BaseFilters";
import SekaiCardThumbnail from "@/components/cards/SekaiCardThumbnail";
import { fetchProfileExtras, PROFILE_CORE_KEYS, type ProfileCardState } from "@/hooks/useProfileExtras";
import { useCharacterHonorStyles } from "@/hooks/useCharacterHonorStyles";
import { useStarMoeAccountSync } from "@/hooks/useStarMoeAccountSync";
import {
    characterHonorStyleOptions,
    resolveCharacterHonorStyle,
} from "@/lib/character-honor-styles";
import { getLeaderCardId, normalizeAccountDataError, type MoesekaiAccount } from "@/lib/account";
import { useViewedGameAccount } from "@/lib/account/hooks";
import DegreeImage from "@/components/honor/DegreeImage";
import { useI18n } from "@/contexts/I18nContext";
import { replaceAssetSourceRegion, useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import {
    getAssetBaseUrl,
    getAttrIconUrl,
    getCardCutoutUrl,
    getCardThumbnailUrl,
    getCharacterIconUrl,
    getPlayerFramePartUrl,
} from "@/lib/assets";
import { HONOR_ART_CANVAS, honorOverlayAnchor, resolveHonorArt, supportsHonorStyle } from "@/lib/honor-art";
import { fetchMasterData, fetchMasterDataForServer, getCurrentServer, type ServerSourceType } from "@/lib/fetch";
import { getCharacterName } from "@/lib/i18n";
import { canvasToPngBlob, saveImageBlob } from "@/lib/imageActions";
import { replaceCurrentUrlSearchParams } from "@/lib/localized-path";
import {
    PLAYER_FRAME_PART_COUNT,
    PLAYER_FRAME_PART_IDS,
    PLAYER_FRAME_CELLS,
    computePlayerFrameComposition,
    drawPlayerFrame,
    playerFrameAssetPaths,
    playerFrameCellCanvas,
    type PlayerFrameCardArt,
    type PlayerFrameCell,
    type PlayerFrameCellCanvas,
    type PlayerFrameComposition,
    type PlayerFrameHonorArt,
    type PlayerFrameKind,
    type PlayerFrameOrientation,
    type PlayerFramePartId,
    type PlayerFrameSize,
} from "@/lib/player-frame";
import { CHAR_COLORS, ATTR_NAMES, UNIT_DATA, UNIT_ICON_FILES, UNIT_ID_LABEL_KEYS, getCardDefaultTrainedStatus, type CardAttribute, type CardRarityType, type ICardInfo } from "@/types/types";
import type { IHonorGroup, IHonorInfo } from "@/types/honor";

/** A sprite plus the natural size the composition needs. */
interface Sprite extends PlayerFrameSize {
    image: HTMLImageElement;
}

interface Preview {
    composition: PlayerFrameComposition;
    cell: PlayerFrameCell;
    cellCanvas: PlayerFrameCellCanvas;
    sprites: Map<string, Sprite>;
    /** The card drawn behind the frame, with the game art that fills it. */
    card: PlayerFrameCardArt;
}

interface PlayerFrameRow {
    id: number;
    seq: number;
    playerFrameGroupId: number;
    description?: string;
    gameCharacterId?: number;
    partsCount?: number;
}

interface PlayerFrameGroupRow {
    id: number;
    assetbundleName: string;
}

interface CardRow {
    id: number;
    characterId: number;
    assetbundleName: string;
    prefix?: string;
    cardRarityType?: string;
    attr?: string;
    releaseAt?: number;
    /** `done` for the cards the game starts trained: they ship only the after-training art. */
    initialSpecialTrainingStatus?: "not_doing" | "done";
}

/** One row of `gameCharacters.json`; the name is spelled by the server (traditional on JP, simplified on CN). */
interface GameCharacterRow {
    id: number;
    firstName?: string;
    givenName?: string;
}

interface HonorRow {
    id: number;
    seq?: number;
    groupId: number;
    honorRarity?: string;
    name?: string;
    assetbundleName?: string;
    /** Set on the titles whose badge prints a counter (the mission families). */
    honorMissionType?: string;
    /** Per-level bundles and rarities; the first one is the level the previews draw. */
    levels?: IHonorInfo["levels"];
}

interface HonorGroupRow {
    id: number;
    honorType?: string;
    name?: string;
    backgroundAssetbundleName?: string;
    frameName?: string;
}

/** One selectable frame of a family. */
interface FrameOption {
    id: number;
    /** The rank tier the frame was awarded for, parsed out of the masterdata description. */
    tier: number | null;
    /** Which character the frame belongs to; the single family has one frame per character. */
    characterId: number | null;
}

interface FrameFamily {
    kind: PlayerFrameKind;
    bundle: string;
    frames: FrameOption[];
}

interface HonorLibrary {
    byId: Map<number, HonorRow>;
    groupById: Map<number, HonorGroupRow>;
    /** Pre-sorted for the picker: the character's own honors first, then the common types. */
    ordered: HonorRow[];
}

const ORIENTATIONS: readonly PlayerFrameOrientation[] = ["vertical", "horizontal"];
const FRAME_KINDS: readonly PlayerFrameKind[] = ["combination", "single"];

/**
 * The third choice of the frame-series control: keep the card, skip the frame artwork over it. It is
 * a control value only — the family the page keeps drawing stays in `kind`, so switching back to
 * WL3 / WL2 restores the same frame without a reload.
 */
const FRAME_HIDDEN = "none";


/** Character ids in masterdata order; every part can be any of them. */
const CHARACTER_IDS: readonly number[] = UNIT_DATA.flatMap(unit => unit.charIds).sort((left, right) => left - right);

const DEFAULT_PARTS: Record<PlayerFramePartId, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };

/** The level the stand-in card shows; the real one comes from the player's account. */
const PLACEHOLDER_LEVEL = 60;
/** The two numbers the card face prints and the user can choose here. */
const MAX_CARD_LEVEL = 60;
const MAX_MASTER_RANK = 5;

const RARITY_ORDER: Record<string, number> = { rarity_birthday: 5, rarity_4: 4, rarity_3: 3, rarity_2: 2, rarity_1: 1 };
/** The card picker's rarity chips, highest first; the star count draws the client's own sprite. */
const PICKER_RARITIES: readonly { type: CardRarityType; stars: number }[] = [
    { type: "rarity_4", stars: 4 },
    { type: "rarity_3", stars: 3 },
    { type: "rarity_2", stars: 2 },
    { type: "rarity_1", stars: 1 },
    { type: "rarity_birthday", stars: 0 },
];
const PICKER_ATTRIBUTES: readonly CardAttribute[] = ["cool", "cute", "happy", "mysterious", "pure"];
const HONOR_TYPE_ORDER = ["character", "achievement", "rank_match", "event", "birthday"];
/** Honors the picker shows before the "load more" row; the whole list stays reachable. */
const HONOR_PAGE_SIZE = 60;
/**
 * A character honor is composed from a background style (`honorBackgrounds`) plus a word
 * (`honorWords`), both picked in game. Null means "whatever the honor draws by default", which is
 * the group's first style and its first word.
 */
type CharacterHonorStyleOptions = ReturnType<typeof characterHonorStyleOptions>;
interface HonorSlotStyle {
    readonly backgroundId: number | null;
    readonly wordId: number | null;
}
const EMPTY_HONOR_STYLE: HonorSlotStyle = { backgroundId: null, wordId: null };
const HONOR_SLOT_COUNT = 3;
function newHonorStyles(): HonorSlotStyle[] {
    return Array.from({ length: HONOR_SLOT_COUNT }, () => EMPTY_HONOR_STYLE);
}
/** Asset sites that publish a `sekai-<region>-assets` bundle; honors are only in their own region. */
const HONOR_ASSET_REGIONS = new Set(["jp", "cn", "tw", "en"]);

/** The card sprites the client already ships for its card thumbnails. */
const CARD_SPRITE_BASE = "/data/sekai_cards_assets";
/** Master rank shown on the stand-in card; the real one is the player's own mastery. */
const PLACEHOLDER_MASTER_RANK = 5;
/** The client's own text face, used for the level and the name. */
const GAME_FONT_FAMILY = "SekaiCardFont";
const GAME_FONT_PATH = "custom_profile/font/fot-rodinntlgpro-db@Font.otf";

/**
 * The client's font is the Japanese `FOT-RodinNTLGPro-DB`: it has no simplified-only glyphs and the
 * CN pack ships no font of its own, so a Chinese name drawn with it mixes two faces. The card text
 * therefore follows the selected game server, exactly like the names do: the JP server draws with
 * the client's own face, every other server with a CJK face of its own script.
 */
const CARD_FONT_STACKS: Record<string, string> = {
    jp: `"${GAME_FONT_FAMILY}", "Roboto Flex", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif`,
    cn: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
    tw: '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif',
    kr: '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
    en: `"${GAME_FONT_FAMILY}", "Roboto Flex", "Segoe UI", sans-serif`,
};
/** The servers whose card text is drawn with the client's own font. */
const GAME_FONT_SERVERS = new Set(["jp", "en"]);

let gameFontLoading: Promise<string | null> | null = null;

/** Loads the client's font once; when it fails the card simply draws with the page font. */
function loadGameFont(fontUrl: string): Promise<string | null> {
    if (typeof window === "undefined" || typeof FontFace === "undefined") return Promise.resolve(null);
    gameFontLoading ??= (async () => {
        try {
            const face = new FontFace(GAME_FONT_FAMILY, `url(${fontUrl})`);
            await face.load();
            document.fonts.add(face);
            return GAME_FONT_FAMILY;
        } catch {
            return null;
        }
    })();
    return gameFontLoading;
}

/** The game's per-character colour, the one the client tiles the part grid with. */
function characterColor(characterId: number): string {
    return CHAR_COLORS[String(characterId)] ?? "#8e8e9e";
}

/**
 * Sprites are immutable per URL, so one module-level cache keeps a frame alive across tab
 * switches and remounts; a failed load is dropped so a retry can refetch it.
 */
const spriteCache = new Map<string, Promise<Sprite | null>>();

function loadSprite(url: string): Promise<Sprite | null> {
    const cached = spriteCache.get(url);
    if (cached) return cached;
    const loading = new Promise<Sprite | null>(resolve => {
        const image = new Image();
        // Required to rasterize the CDN images into a canvas and export them.
        image.crossOrigin = "anonymous";
        image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => {
            spriteCache.delete(url);
            resolve(null);
        };
        image.src = url;
    });
    spriteCache.set(url, loading);
    return loading;
}

/** The first sprite of `urls` that loads; some honors live under a different asset path. */
async function loadFirstSprite(urls: readonly string[]): Promise<Sprite | null> {
    for (const url of urls) {
        const sprite = await loadSprite(url);
        if (sprite) return sprite;
    }
    return null;
}

/** The badge art each honor size is composed on; a placement plate is positioned against it. */
const HONOR_ART_SIZE = HONOR_ART_CANVAS;

/**
 * Where the game pastes an honor's placement plate, in fractions of the honor art so the plate keeps
 * its native pixel size at whatever size the cell draws the badge. The pixel anchor itself lives in
 * `honor-art.ts` (`honorOverlayAnchor`) so this canvas and the SVG badge cannot drift apart: a
 * rank-match tier (180x78 / 158x40) at (190, 0) main and (17, 42) sub, an event title's rank plate
 * (150x78 / 120x38) at (190, 0) and (34, 42). A plate that already is the badge's own canvas (World
 * Link character plates ship as 380x80 / 180x80) covers all of it.
 */
function honorPlateBox(
    plate: { width: number; height: number },
    sub: boolean,
    rankMatch: boolean,
): readonly [number, number, number, number] {
    const art = HONOR_ART_SIZE[sub ? "sub" : "main"];
    if (plate.width === art.width && plate.height === art.height) return [0, 0, 1, 1];
    const anchor = honorOverlayAnchor(rankMatch ? "rank_match" : "event", sub);
    return [anchor.x / art.width, anchor.y / art.height, plate.width / art.width, plate.height / art.height];
}

/**
 * Where the game pastes an honor-mission scroll, in fractions of the honor art like the plates above:
 * one sprite for both sizes, started at (215, 3) main and (37, 3) sub, with the count centred on it.
 */
function honorScrollBox(
    plate: { width: number; height: number },
    sub: boolean,
): readonly [number, number, number, number] {
    const art = HONOR_ART_SIZE[sub ? "sub" : "main"];
    const anchor = honorOverlayAnchor("scroll", sub);
    return [anchor.x / art.width, anchor.y / art.height, plate.width / art.width, plate.height / art.height];
}

/** The rank tier of a frame, e.g. 100 / 1000, read out of the masterdata description. */
function parseTier(description: string | undefined): number | null {
    const match = /TOP\s*(\d+)/i.exec(description ?? "");
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function partCharacter(parts: Readonly<Record<PlayerFramePartId, number>>, part: PlayerFramePartId): number {
    return parts[part] ?? parts[1];
}

function parsePartsParam(value: string | null): Record<PlayerFramePartId, number> | null {
    if (!value) return null;
    const entries = value.split(",").map(item => Number(item.trim()));
    if (entries.length < PLAYER_FRAME_PART_IDS.length) return null;
    if (!PLAYER_FRAME_PART_IDS.every((_part, index) => CHARACTER_IDS.includes(entries[index]))) return null;
    const parts = {} as Record<PlayerFramePartId, number>;
    PLAYER_FRAME_PART_IDS.forEach((part, index) => {
        parts[part] = entries[index];
    });
    return parts;
}

function parseHonorParam(value: string | null): (number | null)[] | null {
    if (!value) return null;
    const entries = value.split(",").map(item => {
        const id = Number(item.trim());
        return Number.isInteger(id) && id > 0 ? id : null;
    });
    if (entries.every(entry => entry === null)) return null;
    return [entries[0] ?? null, entries[1] ?? null, entries[2] ?? null];
}

/** The `honorBg` / `honorWord` pair of a shared link, one id per honor slot; 0 is the default. */
function parseHonorStyleParams(backgrounds: string | null, words: string | null): HonorSlotStyle[] | null {
    const parse = (value: string | null): (number | null)[] =>
        (value ?? "").split(",").map(item => {
            const id = Number(item.trim());
            return Number.isInteger(id) && id > 0 ? id : null;
        });
    const backgroundIds = parse(backgrounds);
    const wordIds = parse(words);
    const next = newHonorStyles().map((style, index) => ({
        backgroundId: backgroundIds[index] ?? null,
        wordId: wordIds[index] ?? null,
    }));
    return next.some(style => style.backgroundId !== null || style.wordId !== null) ? next : null;
}

/** Only 3★ and 4★ cards ship a second, post-training face; 1★/2★ and birthday cards have one. */
function hasTrainedFace(card: Pick<CardRow, "cardRarityType">): boolean {
    return card.cardRarityType === "rarity_4" || card.cardRarityType === "rarity_3";
}

/**
 * `userPlayerFrames[].partsLayout[].partPosition` as the part slot it names: the game writes
 * `part1` … `part6`, matching the six sprites of a combination frame.
 */
function playerFramePartSlot(partPosition: string): PlayerFramePartId | null {
    const match = /^part([1-6])$/.exec(partPosition.trim());
    if (!match) return null;
    const slot = Number(match[1]) as PlayerFramePartId;
    return PLAYER_FRAME_PART_IDS.includes(slot) ? slot : null;
}

/** Cards of every character, the newest highest-rarity first. */
function cardsByCharacter(cards: readonly CardRow[]): Map<number, CardRow[]> {
    const grouped = new Map<number, CardRow[]>();
    for (const card of cards) {
        const list = grouped.get(card.characterId) ?? [];
        list.push(card);
        grouped.set(card.characterId, list);
    }
    for (const list of grouped.values()) {
        list.sort((left, right) => {
            const rarity = (RARITY_ORDER[right.cardRarityType ?? ""] ?? 0) - (RARITY_ORDER[left.cardRarityType ?? ""] ?? 0);
            return rarity !== 0 ? rarity : (right.releaseAt ?? 0) - (left.releaseAt ?? 0);
        });
    }
    return grouped;
}

function buildHonorLibrary(honors: readonly HonorRow[], groups: readonly HonorGroupRow[], characterId: number): HonorLibrary {
    const groupById = new Map(groups.map(group => [group.id, group]));
    const score = (honor: HonorRow): number[] => {
        const group = groupById.get(honor.groupId);
        const isCharacterHonor = group?.honorType === "character";
        // This character's own titles first, then the shared honor families, then other characters'.
        const own = isCharacterHonor ? (honor.groupId === characterId ? 0 : 2) : 1;
        const typeIndex = HONOR_TYPE_ORDER.indexOf(group?.honorType ?? "");
        return [own, typeIndex < 0 ? HONOR_TYPE_ORDER.length : typeIndex];
    };
    const ordered = [...honors].sort((left, right) => {
        const leftScore = score(left);
        const rightScore = score(right);
        return (
            leftScore[0] - rightScore[0] ||
            leftScore[1] - rightScore[1] ||
            (right.seq ?? 0) - (left.seq ?? 0) ||
            left.id - right.id
        );
    });
    return { byId: new Map(honors.map(honor => [honor.id, honor])), groupById, ordered };
}

function honorName(honor: HonorRow | null | undefined): string {
    return honor?.name ?? "";
}

/**
 * What a plate looks like. Every rarity of one character title reads the same, so they share a key:
 * the randomiser uses it to keep the three slots from showing the same plate twice.
 */
function honorPlateKey(library: HonorLibrary | null, honor: HonorRow): string {
    const group = library?.groupById.get(honor.groupId);
    return group?.honorType === "character" ? `character:${honor.groupId}` : `honor:${honor.id}`;
}

/** The client's rarity word for an honor; the servers reuse one background per rarity band. */
function honorRarityLabel(t: (key: string) => string, rarity: string | undefined): string {
    if (!rarity) return "";
    const key = `common.honor.rarities.${rarity}`;
    const label = t(key);
    return label === key ? rarity : label;
}

/** The client's type word for an honor, e.g. achievement / event / rank match. */
function honorTypeLabel(t: (key: string) => string, type: string | undefined): string {
    if (!type) return "";
    const key = `common.honor.types.${type}`;
    const label = t(key);
    return label === key ? type : label;
}

/**
 * The medallions a character honor can show: every background style paired with every word (two
 * of each, so four plates). The sub slots draw the style alone, so they offer one plate per style.
 * `null` ids mean "the honor's own default", which the plate itself never needs to draw.
 */
/** One plate a character honor can show, with the two masterdata names that make it up. */
interface HonorStyleCombination {
    backgroundId: number | null;
    wordId: number | null;
    backgroundName: string;
    wordName: string | null;
    /** Both names, for a tooltip. */
    label: string;
}

/**
 * The medallions a character honor can show: every background style paired with every word (two of
 * each, so four plates). Every slot offers the same four — a sub slot simply draws the style half of
 * the pair, exactly like the game does.
 */
function honorStyleCombinations(options: CharacterHonorStyleOptions): HonorStyleCombination[] {
    if (options.backgrounds.length === 0) return [];
    const combinations: HonorStyleCombination[] = [];
    for (const background of options.backgrounds) {
        if (options.words.length === 0) {
            combinations.push({
                backgroundId: background.id,
                wordId: null,
                backgroundName: background.name,
                wordName: null,
                label: background.name,
            });
            continue;
        }
        for (const word of options.words) {
            combinations.push({
                backgroundId: background.id,
                wordId: word.id,
                backgroundName: background.name,
                wordName: word.name,
                label: `${word.name}（${background.name}）`,
            });
        }
    }
    return combinations;
}

/**
 * One row of the honor picker. A star character honor appears once per style/word pair, which is
 * why the row carries its own combination instead of the honor carrying it.
 */
interface HonorPickerItem {
    key: string;
    honor: HonorRow;
    style: HonorStyleCombination | null;
    /** The pair an untouched slot draws: the game's first style with its first word. */
    isDefaultStyle?: boolean;
}

/** Reads the card and honor masterdata of the server an account plays on. */
async function loadAccountMasters(server: ServerSourceType): Promise<AccountMasters> {
    const [cardRows, honorRows, honorGroups] = await Promise.all([
        fetchMasterDataForServer<CardRow[]>(server, "cards.json").catch((): CardRow[] => []),
        fetchMasterDataForServer<HonorRow[]>(server, "honors.json").catch((): HonorRow[] => []),
        fetchMasterDataForServer<HonorGroupRow[]>(server, "honorGroups.json").catch((): HonorGroupRow[] => []),
    ]);
    return {
        server,
        cards: new Map(cardRows.map(row => [row.id, row])),
        cardsByCharacter: cardsByCharacter(cardRows),
        honors: buildHonorLibrary(honorRows, honorGroups, 0),
    };
}

/**
 * What the randomise button may change. The scope is picked in a small dialog, so a visitor can e.g.
 * only shuffle the titles and keep the card and the frame they chose.
 */
type RandomTarget = "frame" | "card" | "honorMain" | "honorSub1" | "honorSub2";
const RANDOM_TARGETS: readonly RandomTarget[] = ["frame", "card", "honorMain", "honorSub1", "honorSub2"];

interface HonorThumbProps {
    honor: HonorRow;
    honorGroup?: HonorGroupRow;
    /** Sub honors use the 180x80 art, the main slot the 380x80 one. */
    sub: boolean;
    /** The region the honor masterdata came from; its art is only published there. */
    source: AssetSourceType;
    /** Width in CSS pixels, so the medallion keeps the game's aspect ratio. */
    width: number;
    /** Take the row's free width up to `width` instead of keeping a fixed size. */
    fluid?: boolean;
    /** A character honor's chosen background style and word (honorBackgrounds / honorWords ids). */
    honorBackgroundId?: number | null;
    honorWordId?: number | null;
    /** The level to draw: the player's own, else the honor's first one. */
    honorLevel?: number;
}

/** What an account's own server publishes, so its ids mean what the game means by them. */
interface AccountMasters {
    server: ServerSourceType;
    cards: Map<number, CardRow>;
    cardsByCharacter: Map<number, CardRow[]>;
    honors: HonorLibrary;
}

/**
 * One honor medallion, drawn the way the game composes it: degree background, rarity frame and the
 * level stars. `DegreeImage` already resolves the group's shared background, the per-level bundle
 * and the missing-asset placeholder, so the picker and the slot rows reuse it instead of a raw
 * `<img>` (a plain image URL 404s for every honor whose art lives in another region's bundle).
 */
/**
 * A badge width that keeps the main (380x80) and sub (180x80) slots at the same rendered height, so
 * a picker row looks the same whichever slot it fills — the size the slot itself draws.
 */
function honorThumbWidth(mainWidth: number, sub: boolean): number {
    return sub ? Math.round((mainWidth * HONOR_ART_CANVAS.sub.width) / HONOR_ART_CANVAS.main.width) : mainWidth;
}

function HonorThumb({ honor, honorGroup, honorLevel, sub, source, width, fluid, honorBackgroundId, honorWordId }: HonorThumbProps) {
    return (
        <span
            className={cn("block shrink-0", fluid && "w-full min-w-0 flex-1")}
            style={fluid ? { maxWidth: width } : { width }}
        >
            <DegreeImage
                honor={honor as unknown as IHonorInfo}
                honorGroup={honorGroup as unknown as IHonorGroup | undefined}
                honorLevel={honorLevel ?? honor.levels?.[0]?.level}
                sub={sub}
                source={source}
                honorBackgroundId={honorBackgroundId ?? undefined}
                honorWordId={honorWordId ?? undefined}
            />
        </span>
    );
}

function FrameCanvas({ preview, label, className, showFrame = true }: { preview: Preview; label: string; className?: string; showFrame?: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { composition, cell, cellCanvas } = preview;
        // Draw at device resolution so the game art stays crisp when CSS scales it down.
        const ratio = typeof window === "undefined" ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        canvas.width = Math.round(cellCanvas.width * ratio);
        canvas.height = Math.round(cellCanvas.height * ratio);
        const context = canvas.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.save();
        context.scale(ratio, ratio);
        drawPlayerFrame(context, {
            composition,
            cell,
            images: preview.sprites,
            card: preview.card,
            canvas: cellCanvas,
            showFrame,
        });
        context.restore();
    }, [preview, showFrame]);

    return <canvas ref={canvasRef} role="img" aria-label={label} className={cn("block h-auto w-full", className)} />;
}

/**
 * One token per slot, with a repeated id collapsed the way the frame preview is described:
 * `[1,1,1,1,1,1]` → `1x6`, `[1,1,2,1]` → `1x2-2-1`.
 */
function collapseIdRuns(ids: readonly number[]): string {
    const tokens: string[] = [];
    for (let index = 0; index < ids.length; ) {
        let run = 1;
        while (index + run < ids.length && ids[index + run] === ids[index]) run += 1;
        tokens.push(run > 1 ? `${ids[index]}x${run}` : String(ids[index]));
        index += run;
    }
    return tokens.join("-");
}

function PlayerFramesContent() {
    const { t, formatNumber } = useI18n();
    const { assetSource } = useTheme();
    const searchParams = useSearchParams();
    /** The game account the visitor is looking at; filling the preview from it is opt-in. */
    const viewedAccount = useViewedGameAccount();
    // Signed in, the accounts saved with the StarMoe pass are pulled back before this page is used.
    useStarMoeAccountSync();
    // Frame sprites ship with the newest content, so they always come from the JP package.
    const source = useMemo(() => replaceAssetSourceRegion(assetSource, "jp"), [assetSource]);
    // Names, honor art and the card face all follow the selected game server.
    const server = getCurrentServer();
    /** The face the card text is drawn with, chosen by the server (see {@link CARD_FONT_STACKS}). */
    const cardFontStack = CARD_FONT_STACKS[server] ?? CARD_FONT_STACKS.cn;
    const usesGameFont = GAME_FONT_SERVERS.has(server);

    const [kind, setKind] = useState<PlayerFrameKind>("combination");
    /** Character names as the selected game server spells them. */
    const [serverCharacterNames, setServerCharacterNames] = useState<Map<number, string>>(new Map());
    const [tier, setTier] = useState<number | null>(null);
    const [orientation, setOrientation] = useState<PlayerFrameOrientation>("vertical");
    const [parts, setParts] = useState<Record<PlayerFramePartId, number>>(() => ({ ...DEFAULT_PARTS }));
    const [singleCharacterId, setSingleCharacterId] = useState(CHARACTER_IDS[0] ?? 1);
    const [activePart, setActivePart] = useState<PlayerFramePartId>(1);
    const [families, setFamilies] = useState<Partial<Record<PlayerFrameKind, FrameFamily>>>({});
    const [cards, setCards] = useState<Map<number, CardRow[]>>(new Map());
    const [cardById, setCardById] = useState<Map<number, CardRow>>(new Map());
    const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
    /** The in-game name printed on the preview once the visitor's own account has been applied. */
    const [playerName, setPlayerName] = useState<string | null>(null);
    /** Which character's cards the picker lists; the choice itself can be any character's. */
    const [pickerCharacterId, setPickerCharacterId] = useState<number | null>(null);
    /** Units the picker's character row is narrowed to; empty means all 26 faces are listed. */
    const [pickerUnitIds, setPickerUnitIds] = useState<string[]>([]);
    /** The picker's own card filters; they only describe what the card grid lists. */
    const [pickerRarities, setPickerRarities] = useState<string[]>([]);
    const [pickerAttrs, setPickerAttrs] = useState<string[]>([]);
    const [pickerQuery, setPickerQuery] = useState("");
    const [trained, setTrained] = useState(false);
    /** Whether the decorative frame is drawn over the card; off shows the bare card plate. */
    const [showFrame, setShowFrame] = useState(true);
    /** The card's level and master rank printed on the preview; both are free choices here. */
    const [cardLevel, setCardLevel] = useState(PLACEHOLDER_LEVEL);
    const [masterRank, setMasterRank] = useState(PLACEHOLDER_MASTER_RANK);
    const [rawHonors, setRawHonors] = useState<{ honors: HonorRow[]; groups: HonorGroupRow[] } | null>(null);
    const [honorIds, setHonorIds] = useState<(number | null)[]>([null, null, null]);
    /**
     * The level the account has on each title. It picks the art band (a mission title changes its
     * bundle every ten levels) and the level badge, so the card shows the same thing the game does.
     */
    const [honorLevels, setHonorLevels] = useState<(number | null)[]>([null, null, null]);
    const [honorStyles, setHonorStyles] = useState<HonorSlotStyle[]>(newHonorStyles);
    const [honorPicked, setHonorPicked] = useState(false);
    /**
     * Which server each piece reads: the account's own, or the page's. A piece the visitor changes by
     * hand moves to the page's server on its own, leaving the other pieces as the account sent them.
     */
    const [accountMasters, setAccountMasters] = useState<AccountMasters | null>(null);
    /** What the randomise button is allowed to change, and its scope dialog. */
    const [randomTargets, setRandomTargets] = useState<RandomTarget[]>([...RANDOM_TARGETS]);
    const [randomScopeOpen, setRandomScopeOpen] = useState(false);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [isExporting, setIsExporting] = useState(false);
    const [reloadToken, setReloadToken] = useState(0);
    const [cardPickerOpen, setCardPickerOpen] = useState(false);
    const [honorPickerSlot, setHonorPickerSlot] = useState<number | null>(null);
    const [honorQuery, setHonorQuery] = useState("");
    /** Which honor family the picker lists; "all" keeps the whole masterdata browsable. */
    const [honorType, setHonorType] = useState<string>("all");
    /** How many honors the picker has revealed so far. */
    const [honorLimit, setHonorLimit] = useState(HONOR_PAGE_SIZE);
    /** Reading the visitor's own game account into the preview. */
    const [isFilling, setIsFilling] = useState(false);
    const [fillNotice, setFillNotice] = useState<string | null>(null);
    /** The "no account to sync" dialog, the same empty state the profile page shows. */
    const [noAccountOpen, setNoAccountOpen] = useState(false);
    // A shared link restores its frame once, before the first URL write can overwrite it.
    const preferredFrameId = useRef<number | null>(null);
    const preferredKind = useRef<PlayerFrameKind | null>(null);
    const preferredHonors = useRef<(number | null)[] | null>(null);
    const restoredFromUrl = useRef(false);
    /**
     * The character the auto-chosen card belongs to, resolved once. Picking parts (Part 1 included)
     * must not swap the card face under the user, so this is remembered instead of following the
     * frame's character on every change.
     */
    const autoCardCharacterId = useRef<number | null>(null);

    /**
     * Names of the game characters in the selected server's own spelling (the CN server writes the
     * simplified form, the JP server the traditional one). Falls back to the UI-language name until
     * the table arrives.
     */
    useEffect(() => {
        let cancelled = false;
        fetchMasterData<GameCharacterRow[]>("gameCharacters.json")
            .then(rows => {
                if (cancelled || !Array.isArray(rows)) return;
                const next = new Map<number, string>();
                for (const row of rows) {
                    const full = `${row.firstName ?? ""}${row.givenName ?? ""}`.trim();
                    if (row.id && full) next.set(row.id, full);
                }
                setServerCharacterNames(next);
            })
            .catch(() => {
                // A missing table just leaves the UI-language names in place.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const characterName = useCallback(
        (characterId: number) => serverCharacterNames.get(characterId) ?? getCharacterName(t, characterId),
        [serverCharacterNames, t],
    );

    useEffect(() => {
        if (restoredFromUrl.current) return;
        restoredFromUrl.current = true;
        const fromUrl = parsePartsParam(searchParams.get("parts"));
        if (fromUrl) setParts(fromUrl);
        const character = Number(searchParams.get("character"));
        if (CHARACTER_IDS.includes(character)) setSingleCharacterId(character);
        if (searchParams.get("view") === "horizontal") setOrientation("horizontal");
        const kindParam = searchParams.get("kind");
        preferredKind.current = kindParam === "single" ? "single" : kindParam === "combination" ? "combination" : null;
        if (kindParam === FRAME_HIDDEN) setShowFrame(false);
        preferredHonors.current = parseHonorParam(searchParams.get("honors"));
        if (preferredHonors.current) {
            setHonorIds(preferredHonors.current);
            setHonorPicked(true);
        }
        const restoredStyles = parseHonorStyleParams(
            searchParams.get("honorBg"),
            searchParams.get("honorWord"),
        );
        if (restoredStyles) setHonorStyles(restoredStyles);
        const frame = Number(searchParams.get("frame"));
        preferredFrameId.current = Number.isInteger(frame) && frame > 0 ? frame : null;
        const card = Number(searchParams.get("card"));
        if (Number.isInteger(card) && card > 0) setSelectedCardId(card);
        if (searchParams.get("trained") === "1") setTrained(true);
        const level = Number(searchParams.get("level"));
        if (Number.isInteger(level) && level >= 1 && level <= MAX_CARD_LEVEL) setCardLevel(level);
        const rank = Number(searchParams.get("rank"));
        if (Number.isInteger(rank) && rank >= 1 && rank <= MAX_MASTER_RANK) setMasterRank(rank);
    }, [searchParams]);

    /**
     * JP masterdata holds both families: the earlier finale ships one fixed frame per character and
     * rank, the newest one ships a frame whose six part slots are all editable. Other servers either
     * lack the second group or have not received it yet, and some groups carry no `playerFrameType`,
     * so a row's own `partsCount` decides which family it belongs to.
     */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [rows, groups] = await Promise.all([
                fetchMasterDataForServer<PlayerFrameRow[]>("jp", "playerFrames.json"),
                fetchMasterDataForServer<PlayerFrameGroupRow[]>("jp", "playerFrameGroups.json"),
            ]);
            const bundleByGroupId = new Map(groups.map(group => [group.id, group.assetbundleName]));
            const nextFamilies: Partial<Record<PlayerFrameKind, FrameFamily>> = {};
            for (const row of [...rows].sort((left, right) => left.seq - right.seq)) {
                const bundle = bundleByGroupId.get(row.playerFrameGroupId);
                if (!bundle) continue;
                const rowKind: PlayerFrameKind = (row.partsCount ?? 0) >= PLAYER_FRAME_PART_COUNT ? "combination" : "single";
                const family = (nextFamilies[rowKind] ??= { kind: rowKind, bundle, frames: [] });
                family.frames.push({
                    id: row.id,
                    tier: parseTier(row.description),
                    characterId: rowKind === "single" ? (row.gameCharacterId ?? null) : null,
                });
            }
            if (cancelled) return;
            if (!nextFamilies.combination && !nextFamilies.single) {
                setStatus("error");
                return;
            }
            setFamilies(nextFamilies);

            const preferred = preferredFrameId.current;
            let initialKind: PlayerFrameKind = nextFamilies.combination ? "combination" : "single";
            let matched: { kind: PlayerFrameKind; frame: FrameOption } | null = null;
            if (preferred !== null) {
                for (const candidate of FRAME_KINDS) {
                    const frame = nextFamilies[candidate]?.frames.find(item => item.id === preferred);
                    if (!frame) continue;
                    matched = { kind: candidate, frame };
                    break;
                }
            }
            if (matched) {
                initialKind = matched.kind;
                setTier(matched.frame.tier);
                if (matched.frame.characterId !== null) setSingleCharacterId(matched.frame.characterId);
            } else if (preferredKind.current && nextFamilies[preferredKind.current]) {
                initialKind = preferredKind.current;
            }
            setKind(initialKind);
        })().catch(() => {
            if (!cancelled) setStatus("error");
        });
        return () => {
            cancelled = true;
        };
    }, [reloadToken]);

    // Cards and honors are cosmetic: if they fail, the frame still composes without them.
    useEffect(() => {
        let cancelled = false;
        fetchMasterData<CardRow[]>("cards.json")
            .then(rows => {
                if (cancelled) return;
                setCards(cardsByCharacter(rows));
                setCardById(new Map(rows.map(row => [row.id, row])));
            })
            .catch(() => {
                if (cancelled) return;
                setCards(new Map());
                setCardById(new Map());
            });
        return () => {
            cancelled = true;
        };
    }, [reloadToken]);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchMasterData<HonorRow[]>("honors.json"),
            fetchMasterData<HonorGroupRow[]>("honorGroups.json"),
        ])
            .then(([honors, groups]) => {
                if (!cancelled) setRawHonors({ honors, groups });
            })
            .catch(() => {
                if (!cancelled) setRawHonors(null);
            });
        return () => {
            cancelled = true;
        };
    }, [reloadToken]);

    const family = families[kind] ?? null;

    /** TOP100 / TOP1000: the reward tier a frame came from, shared by both families. */
    const tiers = useMemo(() => {
        const values = new Set<number>();
        for (const frame of family?.frames ?? []) {
            if (frame.tier !== null) values.add(frame.tier);
        }
        return [...values].sort((left, right) => left - right);
    }, [family]);

    const activeTier = tier !== null && tiers.includes(tier) ? tier : (tiers[0] ?? null);

    const activeFrame = useMemo((): FrameOption | null => {
        const frames = family?.frames ?? [];
        if (frames.length === 0) return null;
        const ofTier = activeTier === null ? frames : frames.filter(frame => frame.tier === activeTier);
        if (kind === "single") {
            return ofTier.find(frame => frame.characterId === singleCharacterId) ?? ofTier[0] ?? frames[0];
        }
        return ofTier[0] ?? frames[0];
    }, [family, activeTier, kind, singleCharacterId]);

    const partKey = PLAYER_FRAME_PART_IDS.map(part => partCharacter(parts, part)).join("-");

    const editable = kind === "combination";
    /** The character the frame belongs to; the card and the honor are chosen independently. */
    const frameCharacterId = editable ? partCharacter(parts, 1) : singleCharacterId;
    const pickerCharacter = pickerCharacterId ?? frameCharacterId;

    /** The account's own asset region, for whatever only its server publishes. */
    const accountSource = useMemo(
        () => (accountMasters ? replaceAssetSourceRegion(assetSource, accountMasters.server) : source),
        [accountMasters, assetSource, source],
    );

    /**
     * Which masterdata answers for a piece: the page's first, then the account's. Looking the id up
     * instead of remembering where it came from is what makes a saved link survive a refresh — the
     * ids come back from the URL, and a title only the account's server publishes still resolves
     * once that server's masters are read in, while a piece picked by hand always resolves on the
     * page's own masterdata.
     */
    const cardIndex = useMemo(() => {
        const fromAccount =
            selectedCardId !== null && !cardById.has(selectedCardId) && accountMasters?.cards.has(selectedCardId);
        return fromAccount && accountMasters
            ? { byId: accountMasters.cards, byCharacter: accountMasters.cardsByCharacter, source: accountSource }
            : { byId: cardById, byCharacter: cards, source };
    }, [selectedCardId, accountMasters, cardById, cards, accountSource, source]);

    /**
     * The card whose art fills the preview. A card the visitor picked wins; then the character the
     * card picker is showing; otherwise the frame's character — resolved once and remembered, so
     * changing a part (Part 1 is the frame's own character) never swaps the card face.
     */
    const activeCard = useMemo(() => {
        const chosen = selectedCardId === null ? null : (cardIndex.byId.get(selectedCardId) ?? null);
        if (chosen) return chosen;
        if (pickerCharacterId !== null) return cardIndex.byCharacter.get(pickerCharacterId)?.[0] ?? null;
        if (autoCardCharacterId.current === null) {
            const first = cardIndex.byCharacter.get(frameCharacterId)?.[0] ?? null;
            if (first) autoCardCharacterId.current = frameCharacterId;
            return first;
        }
        return cardIndex.byCharacter.get(autoCardCharacterId.current)?.[0]
            ?? cardIndex.byCharacter.get(frameCharacterId)?.[0]
            ?? null;
    }, [cardIndex, selectedCardId, pickerCharacterId, frameCharacterId]);

    /** Everything printed on the card follows the card, not the frame. */
    const cardCharacterId = activeCard?.characterId ?? frameCharacterId;
    const cardSupportsTraining =
        activeCard?.cardRarityType === "rarity_4" || activeCard?.cardRarityType === "rarity_3";
    /** A card that starts trained (1167, 1458-1463) has no other face: it is always drawn trained. */
    const cardBornTrained = activeCard ? getCardDefaultTrainedStatus(activeCard) : false;
    const effectiveTrained = cardBornTrained || (trained && cardSupportsTraining);

    const honorLibrary = useMemo(
        () => (rawHonors ? buildHonorLibrary(rawHonors.honors, rawHonors.groups, cardCharacterId) : null),
        [rawHonors, cardCharacterId],
    );

    /**
     * The honors come from the current server's masterdata, and a server only publishes its own
     * honor art: a CN-only title (`honor_story_before_1`, `honor_skill_1`, and so on) is a 404 on the JP
     * asset site. Reading the art from the masterdata's own region is what makes every title in the
     * list show its medallion instead of an empty box.
     */
    const honorSource = useMemo(() => {
        const server = getCurrentServer();
        return HONOR_ASSET_REGIONS.has(server) ? replaceAssetSourceRegion(assetSource, server) : assetSource;
    }, [assetSource]);

    /** The account's own honor region, which differs from the page's when the servers do. */
    const accountHonorSource = useMemo(() => {
        if (!accountMasters) return honorSource;
        const region = accountMasters.server;
        return HONOR_ASSET_REGIONS.has(region) ? replaceAssetSourceRegion(assetSource, region) : honorSource;
    }, [accountMasters, honorSource, assetSource]);

    /** Until the user picks a title, the character's own honor fills the main slot. */
    const effectiveHonorIds = useMemo((): (number | null)[] => {
        if (honorPicked) return honorIds;
        const own = honorLibrary?.ordered.find(
            honor =>
                honor.groupId === cardCharacterId &&
                honorLibrary.groupById.get(honor.groupId)?.honorType === "character",
        );
        return [own?.id ?? null, null, null];
    }, [honorPicked, honorIds, honorLibrary, cardCharacterId]);

    const honorKey = effectiveHonorIds.map(id => id ?? 0).join("-");

    /**
     * Each slot resolves on its own: the page's masterdata first, the account's for a title the page
     * does not have. One slot therefore never decides how another is drawn, and a title picked by
     * hand is always read — and drawn — with the page's server.
     */
    const honorLibraryForSlot = useCallback(
        (slot: number): HonorLibrary | null => {
            const honorId = effectiveHonorIds[slot];
            if (honorId === null || honorId === undefined) return honorLibrary;
            if (honorLibrary?.byId.has(honorId)) return honorLibrary;
            return accountMasters?.honors ?? honorLibrary;
        },
        [effectiveHonorIds, honorLibrary, accountMasters],
    );
    const honorSourceForSlot = useCallback(
        (slot: number): AssetSourceType => {
            const honorId = effectiveHonorIds[slot];
            const fromAccount =
                honorId !== null && honorId !== undefined && !honorLibrary?.byId.has(honorId) && accountMasters;
            return fromAccount ? accountHonorSource : honorSource;
        },
        [effectiveHonorIds, honorLibrary, accountMasters, accountHonorSource, honorSource],
    );

    /** The honor in each slot, resolved once: both the style options and the drawing need it. */
    const honorSlotHonors = useMemo(
        () => effectiveHonorIds.map((honorId, slot) => (
            honorId === null ? null : (honorLibraryForSlot(slot)?.byId.get(honorId) ?? null)
        )),
        [effectiveHonorIds, honorLibraryForSlot],
    );

    /** Only a character honor has a background style and a word, so only then is the pair loaded. */
    const hasCharacterHonor = honorSlotHonors.some(
        (honor, slot) => honor && honorLibraryForSlot(slot)?.groupById.get(honor.groupId)?.honorType === "character",
    );
    /** Whether any slot is filled by the account's masterdata rather than the page's. */
    const usesAccountHonors = effectiveHonorIds.some(
        honorId => honorId !== null && !honorLibrary?.byId.has(honorId) && accountMasters?.honors.byId.has(honorId),
    );
    /**
     * The style tables only ship with the JP masterdata, and the two places need different servers:
     * the picker lists the page's titles, so it reads the page's tables (loaded together with the
     * honor list, so its star rows open into their four plates without a re-render); a slot showing an
     * account's title reads the account's tables. Both are cached per server, and an empty answer
     * simply means that server has no such tables — a CN account never has the new plates.
     */
    const pageHonorStyles = useCharacterHonorStyles(server, honorLibrary !== null);
    const accountHonorStyles = useCharacterHonorStyles(
        accountMasters?.server ?? server,
        accountMasters !== null && usesAccountHonors && hasCharacterHonor,
    );
    const honorStylesForSlot = useCallback(
        (slot: number) => {
            const honorId = effectiveHonorIds[slot];
            const fromAccount =
                honorId !== null && honorId !== undefined && !honorLibrary?.byId.has(honorId) && accountMasters;
            return fromAccount ? accountHonorStyles : pageHonorStyles;
        },
        [effectiveHonorIds, honorLibrary, accountMasters, accountHonorStyles, pageHonorStyles],
    );

    /**
     * A saved link carries ids, not the server they came from: when one of them is missing from the
     * page's masterdata, the account's own masters are read in so the piece can still be drawn.
     */
    const missingHonorMasters = effectiveHonorIds.some(
        honorId => honorId !== null && honorLibrary !== null && !honorLibrary.byId.has(honorId),
    );
    const missingCardMasters = selectedCardId !== null && !cardById.has(selectedCardId);
    const accountServer = viewedAccount && viewedAccount.server !== server ? viewedAccount.server : null;
    useEffect(() => {
        if (accountMasters || !accountServer || (!missingHonorMasters && !missingCardMasters)) return;
        let cancelled = false;
        void loadAccountMasters(accountServer).then(masters => {
            if (!cancelled) setAccountMasters(masters);
        });
        return () => {
            cancelled = true;
        };
    }, [accountMasters, accountServer, missingHonorMasters, missingCardMasters]);

    // Keep the preview shareable, like every other filter state in the app.
    useEffect(() => {
        if (!restoredFromUrl.current || !activeFrame) return;
        const params = new URLSearchParams();
        if (orientation !== "vertical") params.set("view", orientation);
        // With the frame turned off the family, the parts and the frame id say nothing about the
        // picture, so they stay out of the URL: `kind=none` is the whole description.
        if (!showFrame) {
            params.set("kind", FRAME_HIDDEN);
        } else {
            if (kind !== "combination") params.set("kind", kind);
            if (kind === "combination") params.set("parts", partKey.replaceAll("-", ","));
            else params.set("character", String(singleCharacterId));
            params.set("frame", String(activeFrame.id));
        }
        if (effectiveHonorIds.some(id => id !== null)) {
            params.set("honors", effectiveHonorIds.map(id => id ?? 0).join(","));
        }
        // A character honor's style pair: `0` keeps the honor's own default style or word.
        if (honorStyles.some(style => style.backgroundId !== null)) {
            params.set("honorBg", honorStyles.map(style => style.backgroundId ?? 0).join(","));
        }
        if (honorStyles.some(style => style.wordId !== null)) {
            params.set("honorWord", honorStyles.map(style => style.wordId ?? 0).join(","));
        }
        // The card that is actually drawn goes into the URL, not only a hand-picked one: the auto
        // choice lives in a ref, so without this a refresh (or any reload) re-derives it from Part 1
        // and the face silently changes when the parts change.
        const drawnCardId = selectedCardId ?? activeCard?.id ?? null;
        if (drawnCardId !== null) params.set("card", String(drawnCardId));
        if (trained) params.set("trained", "1");
        if (cardLevel !== PLACEHOLDER_LEVEL) params.set("level", String(cardLevel));
        if (masterRank !== PLACEHOLDER_MASTER_RANK) params.set("rank", String(masterRank));
        replaceCurrentUrlSearchParams(params);
    }, [kind, orientation, partKey, singleCharacterId, activeFrame, effectiveHonorIds, honorStyles, selectedCardId, activeCard, trained, showFrame, cardLevel, masterRank]);

    useEffect(() => {
        if (!family || !activeFrame) return;
        const { bundle } = family;
        const { id: frameId } = activeFrame;
        const characterIdByPart: Partial<Record<PlayerFramePartId, number>> = {};
        for (const part of PLAYER_FRAME_PART_IDS) characterIdByPart[part] = partCharacter(parts, part);

        let cancelled = false;
        setStatus("loading");
        (async () => {
            const paths = playerFrameAssetPaths({
                kind,
                bundle,
                frameId,
                orientation,
                characterIdByPart,
            });
            const loaded = await Promise.all(
                Object.entries(paths).map(
                    async ([name, path]) => [name, await loadSprite(getPlayerFramePartUrl(path, source))] as const,
                ),
            );
            const sprites = new Map<string, Sprite>();
            for (const [name, sprite] of loaded) {
                if (!sprite) {
                    if (!cancelled) setStatus("error");
                    return;
                }
                sprites.set(name, sprite);
            }
            const sizes: Record<string, PlayerFrameSize> = {};
            for (const [name, sprite] of sprites) sizes[name] = { width: sprite.width, height: sprite.height };
            const composition = computePlayerFrameComposition(kind, orientation, sizes, "friend");
            if (!composition) {
                if (!cancelled) setStatus("error");
                return;
            }

            // The card behind the frame: the chosen card's art plus the client's own card sprites
            // (attribute, rarity stars, master rank) and, per slot, the chosen honor's degree art.
            const cardBundle = activeCard?.assetbundleName ?? null;
            const cardAttr = activeCard?.attr ?? null;
            const isBirthday = activeCard?.cardRarityType === "rarity_birthday";
            // The client prints one birthday mark, otherwise one star per rarity level.
            const rarityCount = isBirthday ? 1 : (RARITY_ORDER[activeCard?.cardRarityType ?? ""] ?? 0);
            const starFile = isBirthday
                ? "rare_birthday.png"
                : effectiveTrained
                  ? "rare_star_after_training.png"
                  : "rare_star_normal.png";
            const frameSuffix = isBirthday
                ? "birthday"
                : String(RARITY_ORDER[activeCard?.cardRarityType ?? ""] ?? 1);
            const cardSource = cardIndex.source;
            const [cutout, thumbnail, cardFrame, attribute, star, masterRankSprite, , ...honorSprites] =
                await Promise.all([
                    // The portrait card draws the cutout art; the friend row draws the thumbnail.
                    cardBundle ? loadSprite(getCardCutoutUrl(cardBundle, effectiveTrained, cardSource)) : Promise.resolve(null),
                    cardBundle
                        ? loadSprite(getCardThumbnailUrl(cardCharacterId, cardBundle, effectiveTrained, cardSource))
                        : Promise.resolve(null),
                    // The friend row's avatar is the shared S-size card visual, which needs its frame.
                    loadSprite(`${CARD_SPRITE_BASE}/frame_rarity_${frameSuffix}.png`),
                    // The client's own `card/icon_attribute_{attr}_64.png` sprite.
                    cardAttr ? loadSprite(`${CARD_SPRITE_BASE}/icon_attribute_${cardAttr}_64.png`) : Promise.resolve(null),
                    loadSprite(`${CARD_SPRITE_BASE}/${starFile}`),
                    loadSprite(`${CARD_SPRITE_BASE}/train_rank_${masterRank}.png`),
                    // Only downloaded for the languages whose card text is the client's own font;
                    // the other languages draw with a CJK face and must not mix the two.
                    usesGameFont
                        ? loadGameFont(`${getAssetBaseUrl(source)}/${GAME_FONT_PATH}`)
                        : Promise.resolve(null),
                    ...effectiveHonorIds.map(async (honorId, slot) => {
                    const slotLibrary = honorLibraryForSlot(slot);
                    const slotHonorSource = honorSourceForSlot(slot);
                    const honor = honorId === null ? null : (slotLibrary?.byId.get(honorId) ?? null);
                    if (!honor) return null;
                    const sub = slot > 0;
                    const group = slotLibrary?.groupById.get(honor.groupId);
                    // A character honor's style is only composed when the player picked one; otherwise
                    // the legacy degree art already carries its word. `DegreeImage` draws the same way,
                    // and both take the actual asset decision from `resolveHonorArt`.
                    const slotStyle = honorStyles[slot] ?? EMPTY_HONOR_STYLE;
                    const slotCharacterStyles = honorStylesForSlot(slot);
                    const stylePicked = supportsHonorStyle(honor, group)
                        && (slotStyle.backgroundId !== null || slotStyle.wordId !== null);
                    const characterStyle = slotCharacterStyles && stylePicked
                        ? resolveCharacterHonorStyle(
                              slotCharacterStyles,
                              honor.groupId,
                              slotStyle.backgroundId ?? undefined,
                              slotStyle.wordId ?? undefined,
                          )
                        : null;
                    const spec = resolveHonorArt({
                        honor,
                        group,
                        level: honorLevels[slot] ?? null,
                        sub,
                        // The title's own region first, then the page's: a server only publishes its
                        // own art, and a CN-only title is a 404 on the JP site.
                        sources: [slotHonorSource, source],
                        style: characterStyle?.background
                            ? {
                                  backgroundAssetbundleName: characterStyle.background.assetbundleName,
                                  wordAssetbundleName: characterStyle.word?.assetbundleName ?? null,
                              }
                            : null,
                    });
                    const [styleBackground, frame, overlay, word, badge, badgeSix] = await Promise.all([
                        spec.styleBackgrounds.length > 0
                            ? loadFirstSprite(spec.styleBackgrounds)
                            : Promise.resolve(null),
                        loadFirstSprite(spec.frames),
                        spec.overlay ? loadFirstSprite(spec.overlay.urls) : Promise.resolve(null),
                        spec.words.length > 0 ? loadFirstSprite(spec.words) : Promise.resolve(null),
                        spec.levelBadge ? loadFirstSprite(spec.levelBadge.urls) : Promise.resolve(null),
                        spec.levelBadge?.urlsSix ? loadFirstSprite(spec.levelBadge.urlsSix) : Promise.resolve(null),
                    ]);
                    // The style background carries no word; if that art is missing the legacy degree
                    // art (word baked in) is still drawn, so the word is only layered over the style.
                    const background = styleBackground ?? (spec.backgrounds.length > 0
                        ? await loadFirstSprite(spec.backgrounds)
                        : null);
                    if (!background && !frame) return null;
                    const overlayKind = spec.overlay?.kind ?? null;
                    return {
                        background: background?.image ?? null,
                        word: styleBackground && word ? word.image : null,
                        frame: frame?.image ?? null,
                        overlay: overlay && overlayKind
                            ? {
                                  image: overlay.image,
                                  box: overlayKind === "scroll"
                                      ? honorScrollBox(overlay, sub)
                                      : honorPlateBox(overlay, sub, overlayKind === "rank_match"),
                              }
                            : null,
                        levelBadge: spec.levelBadge
                            ? {
                                  kind: spec.levelBadge.kind,
                                  count: spec.levelBadge.count,
                                  image: badge?.image ?? null,
                                  imageSix: badgeSix?.image ?? null,
                                  // The badge offsets are expressed in the art canvas itself.
                                  artWidth: sub ? 180 : 380,
                                  artHeight: 80,
                              }
                            : null,
                    } as PlayerFrameHonorArt;
                }),
            ]);
            if (cancelled) return;

            const cell = PLAYER_FRAME_CELLS[orientation];
            setPreview({
                composition,
                cell,
                cellCanvas: playerFrameCellCanvas(composition, cell),
                sprites,
                card: {
                    illustration: orientation === "vertical" ? (cutout?.image ?? null) : (thumbnail?.image ?? null),
                    cardFrame: cardFrame?.image ?? null,
                    attribute: attribute?.image ?? null,
                    star: star?.image ?? null,
                    rarityCount,
                    masterRank: masterRankSprite?.image ?? null,
                    honors: honorSprites,
                    levelLabel: t("page.playerFrames.card.level", { level: formatNumber(cardLevel) }),
                    // The client prints the player's own name; until an account is applied the
                    // character the card belongs to stands in for it.
                    name: playerName ?? characterName(cardCharacterId),
                    // The UI language decides the face; the sprite only says whether the client's
                    // font is available at all (it is skipped for the CJK languages).
                    fontFamily: cardFontStack,
                },
            });
            setStatus("ready");
        })().catch(() => {
            if (!cancelled) setStatus("error");
        });
        return () => {
            cancelled = true;
        };
    }, [
        kind,
        family,
        activeFrame,
        orientation,
        partKey,
        parts,
        singleCharacterId,
        source,
        honorSource,
        honorLibraryForSlot,
        honorSourceForSlot,
        honorStylesForSlot,
        cardIndex,
        reloadToken,
        cardCharacterId,
        activeCard,
        effectiveTrained,
        effectiveHonorIds,
        honorLibrary,
        honorKey,
        honorStyles,
        honorLevels,
        cardLevel,
        masterRank,
        cardFontStack,
        usesGameFont,
        characterName,
        playerName,
        t,
        formatNumber,
    ]);

    const setCharacter = useCallback(
        (characterId: number) => {
            if (editable) setParts(current => ({ ...current, [activePart]: characterId }));
            else setSingleCharacterId(characterId);
        },
        [editable, activePart],
    );

    /**
     * Random picks for whatever the visitor enabled in the scope dialog. The three honor slots never
     * end up with the same plate — a fan plate counts as one plate whatever its rarity — while a
     * hand-picked title is free to repeat one. The card is independent of the titles.
     */
    const randomize = useCallback(() => {
        const enabled = new Set(randomTargets);
        const pickOne = <T,>(items: readonly T[]): T | null =>
            (items.length === 0 ? null : items[Math.floor(Math.random() * items.length)] ?? null);

        if (enabled.has("frame")) {
            const pickCharacter = () => CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)] ?? 1;
            if (!editable) {
                setSingleCharacterId(pickCharacter());
            } else {
                const next = {} as Record<PlayerFramePartId, number>;
                for (const part of PLAYER_FRAME_PART_IDS) next[part] = pickCharacter();
                setParts(next);
            }
        }

        // The card is part of the scope on its own; it does not decide which titles are allowed.
        if (enabled.has("card")) {
            const card = pickOne([...cardIndex.byId.values()]);
            if (card) setSelectedCardId(card.id);
        }

        const slotTargets: [number, RandomTarget][] = [
            [0, "honorMain"],
            [1, "honorSub1"],
            [2, "honorSub2"],
        ];
        const randomSlots = slotTargets.filter(([, target]) => enabled.has(target));
        if (!honorLibrary || randomSlots.length === 0) return;
        // Any character's fan plate plus the profile-ish shared families. Events and rank matches are
        // thousands of plates and would drown the rest out, so they stay a hand-pick choice.
        const pool = honorLibrary.ordered.filter(honor => {
            const type = honorLibrary.groupById.get(honor.groupId)?.honorType;
            return type === "character" || type === "achievement" || type === "birthday";
        });
        // The three slots never show the same plate. A slot left out of the scope keeps what it has,
        // so its plate counts as taken too; the rarity of a plate does not matter here.
        const usedPlates = new Set<string>();
        for (const [slot] of slotTargets) {
            if (randomSlots.some(([randomSlot]) => randomSlot === slot)) continue;
            const honor = honorSlotHonors[slot];
            if (honor) usedPlates.add(honorPlateKey(honorLibraryForSlot(slot), honor));
        }
        const nextIds = [...effectiveHonorIds];
        const nextStyles = [...honorStyles];
        const nextLevels = [...honorLevels];
        for (const [slot] of randomSlots) {
            const candidates = pool.filter(honor => !usedPlates.has(honorPlateKey(honorLibrary, honor)));
            const honor = pickOne(candidates.length > 0 ? candidates : pool);
            if (!honor) continue;
            usedPlates.add(honorPlateKey(honorLibrary, honor));
            nextIds[slot] = honor.id;
            // The new title may belong to another group, so its slot starts from that group's default.
            nextStyles[slot] = EMPTY_HONOR_STYLE;
            // …and from its own first level: the level the account had belongs to the title it had.
            nextLevels[slot] = null;
        }
        if (!randomSlots.some(([slot]) => nextIds[slot] !== effectiveHonorIds[slot])) return;
        setHonorIds(nextIds);
        setHonorStyles(nextStyles);
        setHonorLevels(nextLevels);
        setHonorPicked(true);
    }, [randomTargets, editable, cardIndex, honorLibrary, effectiveHonorIds, honorStyles, honorLevels, honorSlotHonors, honorLibraryForSlot]);

    const reset = useCallback(() => {
        setParts({ ...DEFAULT_PARTS });
        setSingleCharacterId(CHARACTER_IDS[0] ?? 1);
        setActivePart(1);
        setSelectedCardId(null);
        // Reset everything, so the auto card is resolved again from the frame's own character.
        autoCardCharacterId.current = null;
        setHonorIds([null, null, null]);
        setHonorLevels([null, null, null]);
        setHonorStyles(newHonorStyles());
        setHonorPicked(false);
        // The in-game name read from the account stays: only reading an account again replaces it.
    }, []);

    /**
     * The card a game account shows as its avatar: the leader of the deck it plays. Falling back to
     * its strongest owned card covers accounts whose deck list has not been read yet.
     */
    const pickAccountCard = useCallback(
        (account: MoesekaiAccount, owned: Map<number, ProfileCardState>, cardsById: Map<number, CardRow>): number | null => {
            const leader = account.avatarCardId ?? getLeaderCardId(account.userGamedata, account.userDecks);
            if (leader !== null && cardsById.has(leader)) return leader;
            let best: { id: number; score: number } | null = null;
            for (const id of owned.keys()) {
                const card = cardsById.get(id);
                if (!card) continue;
                const score = (RARITY_ORDER[card.cardRarityType ?? ""] ?? 0) * 1e12 + (card.releaseAt ?? 0);
                if (!best || score > best.score) best = { id, score };
            }
            return best?.id ?? null;
        },
        [],
    );

    /**
     * Reads the visitor's own game account and puts it on the preview: the in-game name, the three
     * equipped titles, and the leader card with the level, master rank and training it has in game.
     * Nothing about other players' UIDs is accepted here — the account must be one this device views.
     */
    const fillFromAccount = useCallback(
        async (account: MoesekaiAccount) => {
            setIsFilling(true);
            try {
                // Only the signature, the three titles and the owned cards are needed here; the music
                // tables the profile page reads are left out of the request.
                const extras = await fetchProfileExtras(account, PROFILE_CORE_KEYS);
                // The account's ids mean what its own server means by them: a card or title that only
                // exists there is neither in the page's masterdata nor on the page's asset site.
                const masters = account.server === server ? null : await loadAccountMasters(account.server);
                const cardId = pickAccountCard(account, extras.cards, masters?.cards ?? cardById);
                const owned = cardId === null ? undefined : extras.cards.get(cardId);
                if (cardId !== null) {
                    setSelectedCardId(cardId);
                    if (owned) {
                        if (Number.isFinite(owned.level) && owned.level > 0) {
                            setCardLevel(Math.min(MAX_CARD_LEVEL, Math.max(1, Math.round(owned.level))));
                        }
                        if (Number.isFinite(owned.masterRank)) {
                            setMasterRank(Math.min(MAX_MASTER_RANK, Math.max(1, Math.round(owned.masterRank))));
                        }
                        setTrained(owned.specialTrainingStatus === "done");
                    }
                }
                // What the account gave us is read in its own server, piece by piece: a title or card
                // it did not send stays on the page's server until the visitor picks one by hand.
                setAccountMasters(masters);
                // Slots follow the honor's own `seq` (1 is the main title), so a slot the player left
                // empty — or one whose honor type the site cannot draw — does not shift the others.
                const slots: (number | null)[] = [null, null, null];
                const nextLevels: (number | null)[] = [null, null, null];
                const nextStyles = newHonorStyles();
                extras.honors.forEach((honor, index) => {
                    const seq = Math.round(honor.seq ?? 0);
                    const slot = seq >= 1 && seq <= slots.length ? seq - 1 : index;
                    if (slot < 0 || slot >= slots.length || slots[slot] !== null) return;
                    slots[slot] = honor.honorId;
                    // A character honor also carries the background style and word the player picked.
                    nextStyles[slot] = {
                        backgroundId: honor.honorBackgroundId ?? null,
                        wordId: honor.honorWordId ?? null,
                    };
                    // …and every honor its own level, which picks the art band and the level badge.
                    const level = Math.round(honor.honorLevel ?? 0);
                    nextLevels[slot] = Number.isFinite(level) && level > 0 ? level : null;
                });
                if (slots.some(id => id !== null)) {
                    setHonorIds(slots);
                    setHonorPicked(true);
                }
                setHonorLevels(nextLevels);
                setHonorStyles(nextStyles);
                // The frame the account attached: the parse sorts by playerFrameId, so the newest
                // (largest id) wins. A combination (WL3) frame also carries the six parts the player
                // composed; a frame the page's masterdata does not carry leaves the current pick.
                const newestFrame = extras.playerFrames.at(-1) ?? null;
                if (newestFrame !== null) {
                    const attachedFrameId = newestFrame.playerFrameId;
                    for (const candidate of FRAME_KINDS) {
                        const frame = families[candidate]?.frames.find(item => item.id === attachedFrameId);
                        if (!frame) continue;
                        setKind(candidate);
                        setTier(frame.tier);
                        if (frame.characterId !== null) setSingleCharacterId(frame.characterId);
                        const layout = newestFrame.partsLayout ?? [];
                        if (candidate === "combination" && layout.length > 0) {
                            const nextParts: Record<PlayerFramePartId, number> = { ...DEFAULT_PARTS };
                            let filled = 0;
                            for (const part of layout) {
                                const slot = playerFramePartSlot(part.partPosition);
                                if (slot === null) continue;
                                nextParts[slot] = part.gameCharacterId;
                                filled += 1;
                            }
                            if (filled > 0) setParts(nextParts);
                        }
                        break;
                    }
                }
                const name = account.userGamedata?.name?.trim() ?? "";
                setPlayerName(name || null);
                setFillNotice(t("page.playerFrames.account.applied", { name: name || account.gameId }));
            } catch (error) {
                const code = normalizeAccountDataError(error);
                setFillNotice(
                    code === "API_NOT_PUBLIC" || code === "NOT_FOUND"
                        ? t("page.playerFrames.account.notPublic")
                        : t("page.playerFrames.account.failed"),
                );
            } finally {
                setIsFilling(false);
            }
        },
        [pickAccountCard, cardById, families, server, t],
    );

    /** The header button: syncs the account being viewed, or says there is none to sync. */
    const useMyAccount = useCallback(() => {
        if (viewedAccount) {
            void fillFromAccount(viewedAccount);
            return;
        }
        setNoAccountOpen(true);
    }, [viewedAccount, fillFromAccount]);

    const chooseHonor = useCallback(
        (honorId: number | null, style?: HonorSlotStyle) => {
            if (honorPickerSlot === null) return;
            const slot = honorPickerSlot;
            const previousGroupId = honorSlotHonors[slot]?.groupId ?? null;
            const nextGroupId = honorId === null ? null : (honorLibrary?.byId.get(honorId)?.groupId ?? null);
            // Start from what the preview shows, so the slots the user did not touch keep their value.
            setHonorIds(() => {
                const next = [...effectiveHonorIds];
                next[slot] = honorId;
                return next;
            });
            // A title picked by hand carries no level: it starts from its own first one.
            if (effectiveHonorIds[slot] !== honorId) {
                setHonorLevels(current => current.map((level, index) => (index === slot ? null : level)));
            }
            if (style) {
                // A star plate's row writes its own style/word pair together with the title.
                setHonorStyles(current => current.map((item, index) => (index === slot ? style : item)));
            } else if (nextGroupId !== previousGroupId) {
                // Another character brings another set of styles; the same one keeps the picked pair.
                setHonorStyles(current =>
                    current.map((item, index) => (index === slot ? EMPTY_HONOR_STYLE : item)),
                );
            }
            setHonorPicked(true);
            setHonorPickerSlot(null);
        },
        [honorPickerSlot, effectiveHonorIds, honorSlotHonors, honorLibrary],
    );

    /** Opens the picker on one slot, from the top of the unfiltered list. */
    const openHonorPicker = useCallback((slot: number) => {
        setHonorQuery("");
        setHonorType("all");
        setHonorLimit(HONOR_PAGE_SIZE);
        setHonorPickerSlot(slot);
    }, []);

    const download = useCallback(async () => {
        if (!preview || isExporting) return;
        setIsExporting(true);
        try {
            // The cell canvas is already at the client's own 2x render scale; export at 1:1.
            const { cellCanvas } = preview;
            const canvas = document.createElement("canvas");
            canvas.width = cellCanvas.width;
            canvas.height = cellCanvas.height;
            const context = canvas.getContext("2d");
            if (!context) return;
            // Drawn on its own canvas first: the row masks itself with `destination-in`, which would
            // erode a plate painted underneath back to partial alpha along the card's edges.
            const artwork = document.createElement("canvas");
            artwork.width = cellCanvas.width;
            artwork.height = cellCanvas.height;
            const artworkContext = artwork.getContext("2d");
            if (!artworkContext) return;
            drawPlayerFrame(artworkContext, {
                composition: preview.composition,
                cell: preview.cell,
                images: preview.sprites,
                card: preview.card,
                canvas: cellCanvas,
                showFrame,
            });

            const blob = await canvasToPngBlob(artwork);
            // The name mirrors the page's own query parameters, so two exports only collide when they
            // would also produce the same URL: the frame, the view, the parts (or the character) and
            // whatever else differs from the defaults.
            // With the frame off there is no family, no parts and no frame id in the picture, so the
            // name states that and nothing else; otherwise it describes how the frame was built.
            const nameParts: string[] = [];
            if (showFrame) {
                nameParts.push(String(activeFrame?.id ?? "frame"));
                nameParts.push(orientation);
                nameParts.push(kind === "combination" ? "wl3" : "wl2");
                nameParts.push(
                    kind === "combination"
                        ? collapseIdRuns(PLAYER_FRAME_PART_IDS.map(part => partCharacter(parts, part)))
                        : String(singleCharacterId),
                );
            } else {
                nameParts.push(orientation);
                nameParts.push("noframe");
            }

            if (selectedCardId !== null) nameParts.push(`card-${selectedCardId}`);
            if (effectiveTrained) nameParts.push("trained");
            await saveImageBlob(blob, `player-frame-${nameParts.join("-")}.png`);
        } finally {
            setIsExporting(false);
        }
    }, [preview, isExporting, activeFrame, orientation, kind, parts, singleCharacterId, selectedCardId, effectiveTrained, showFrame]);

    const kindOptions = useMemo(
        () => [
            ...FRAME_KINDS.filter(candidate => families[candidate]).map(candidate => ({
                value: candidate,
                label: t(
                    candidate === "combination"
                        ? "page.playerFrames.family.combination"
                        : "page.playerFrames.family.single",
                ),
            })),
            // The frame itself can be turned off: the card is still drawn, just without the artwork.
            { value: FRAME_HIDDEN, label: t("page.playerFrames.family.none") },
        ],
        [families, t],
    );

    /**
     * The frame-series control's own value: "none" while the frame is hidden, the family otherwise.
     * The family itself stays in `kind`, so picking "none" never destroys the previous choice.
     */
    const frameKindValue = showFrame ? kind : FRAME_HIDDEN;
    const onFrameKindChange = useCallback((value: string) => {
        if (value === FRAME_HIDDEN) {
            setShowFrame(false);
            return;
        }
        setShowFrame(true);
        setKind(value as PlayerFrameKind);
    }, []);

    const tierOptions = useMemo(
        () =>
            tiers.map(value => ({
                value: String(value),
                label: t("page.playerFrames.tier.top", { rank: String(value) }),
            })),
        [tiers, t],
    );

    const orientationOptions = useMemo(
        () =>
            ORIENTATIONS.map(value => ({
                value,
                label: t(
                    value === "vertical" ? "page.playerFrames.preview.vertical" : "page.playerFrames.preview.horizontal",
                ),
            })),
        [t],
    );

    /**
     * The six parts, in the client's tab look (underline + primary label) but as an auto-fitting
     * grid: the MD3 tab row keeps its labels at their natural width (415px for six tabs) and clips
     * `Part 6` inside the narrower character card, while this keeps all six on screen.
     */
    const partTabs = editable ? (
        <div
            role="group"
            aria-label={t("page.playerFrames.parts.title")}
            className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] border-b border-surface-variant"
        >
            {PLAYER_FRAME_PART_IDS.map(part => {
                const selected = part === activePart;
                return (
                    <button
                        key={part}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setActivePart(part)}
                        className={cn(
                            "state-layer focus-ring relative flex h-10 items-center justify-center type-label-l",
                            selected ? "text-primary" : "text-on-surface-variant",
                        )}
                    >
                        {t("page.playerFrames.parts.tab", { index: formatNumber(part) })}
                        {selected && (
                            <span className="absolute inset-x-1.5 bottom-0 h-[3px] rounded-t-full bg-primary" />
                        )}
                    </button>
                );
            })}
        </div>
    ) : null;

    /**
     * Level and master rank of the stand-in card. The client's card face prints both, so they are
     * editable here instead of being frozen at the sample values the preview used to hardcode.
     */
    const cardNumberControls = (
        <div className="mt-3 flex flex-col gap-1">
            <div className="flex items-baseline justify-between type-label-m text-on-surface-variant">
                <span>{t("page.playerFrames.card.levelLabel")}</span>
                <span className="type-label-l text-on-surface">{formatNumber(cardLevel)}</span>
            </div>
            <Slider
                value={cardLevel}
                onValueChange={setCardLevel}
                min={1}
                max={MAX_CARD_LEVEL}
                step={1}
                aria-label={t("page.playerFrames.card.levelLabel")}
            />
            <div className="flex items-baseline justify-between type-label-m text-on-surface-variant">
                <span>{t("page.playerFrames.card.masterRank")}</span>
                <span className="type-label-l text-on-surface">{formatNumber(masterRank)}</span>
            </div>
            <Slider
                value={masterRank}
                onValueChange={setMasterRank}
                min={1}
                max={MAX_MASTER_RANK}
                step={1}
                aria-label={t("page.playerFrames.card.masterRank")}
            />
        </div>
    );

    // The picker browses every character's cards; the frame's character is only the default.
    const cardOptions = cards.get(pickerCharacter) ?? [];

    /** The picker's character row lists the chosen units, or all 26 faces while none is chosen. */
    const pickerCharacterIds = pickerUnitIds.length === 0
        ? CHARACTER_IDS
        : UNIT_DATA.filter(unit => pickerUnitIds.includes(unit.id)).flatMap(unit => unit.charIds);

    const togglePickerUnit = (unitId: string) => {
        setPickerUnitIds(current => (current.includes(unitId)
            ? current.filter(id => id !== unitId)
            : [...current, unitId]));
    };

    const togglePickerValue = (current: string[], setCurrent: (next: string[]) => void, value: string) => {
        setCurrent(current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
    };

    /**
     * The card grid under the filters: this character's cards, narrowed by rarity, attribute and
     * search. With "after training" chosen only 3★/4★ cards stay listed, since they are the only
     * ones that have a trained face at all.
     */
    const pickerCards = cardOptions.filter(card => {
        if (trained && !hasTrainedFace(card)) return false;
        if (pickerRarities.length > 0 && !pickerRarities.includes(card.cardRarityType ?? "")) return false;
        if (pickerAttrs.length > 0 && !pickerAttrs.includes(card.attr ?? "")) return false;
        const query = pickerQuery.trim().toLowerCase();
        return query === "" || (card.prefix ?? "").toLowerCase().includes(query);
    });

    /** Whether the reset row is worth showing: any of the picker's own filters is set. */
    const pickerFiltersActive =
        pickerUnitIds.length > 0 || pickerRarities.length > 0 || pickerAttrs.length > 0 || pickerQuery.trim() !== "";

    const resetPickerFilters = () => {
        setPickerRarities([]);
        setPickerAttrs([]);
        setPickerQuery("");
        setPickerUnitIds([]);
    };

    /** The honor families actually present in this server's masterdata, biggest first. */
    const honorTypeOptions = useMemo(() => {
        if (!honorLibrary) return [] as { type: string; count: number }[];
        const counts = new Map<string, number>();
        for (const honor of honorLibrary.ordered) {
            const type = honorLibrary.groupById.get(honor.groupId)?.honorType;
            if (!type) continue;
            counts.set(type, (counts.get(type) ?? 0) + 1);
        }
        const rank = (type: string) => {
            const index = HONOR_TYPE_ORDER.indexOf(type);
            return index < 0 ? HONOR_TYPE_ORDER.length : index;
        };
        return [...counts.entries()]
            .sort(([leftType, leftCount], [rightType, rightCount]) =>
                rank(leftType) - rank(rightType) || rightCount - leftCount || leftType.localeCompare(rightType),
            )
            .map(([type, count]) => ({ type, count }));
    }, [honorLibrary]);

    /**
     * The star plate of one character honor, expanded into the four medallions it can show. Lower
     * rarities are one finished image, so they answer with an empty list. The picker lists the
     * page's titles, so it reads the page's style tables — an account on another server does not
     * decide what the picker can offer.
     */
    const pickerCombinations = useCallback(
        (honor: HonorRow): HonorStyleCombination[] => {
            if (!pageHonorStyles || honorPickerSlot === null) return [];
            const group = honorLibrary?.groupById.get(honor.groupId);
            if (!supportsHonorStyle(honor, group)) return [];
            return honorStyleCombinations(characterHonorStyleOptions(pageHonorStyles, honor.groupId));
        },
        [pageHonorStyles, honorLibrary, honorPickerSlot],
    );

    /**
     * Every row of the picker: one title each, except that a star character honor contributes one
     * row per background-style/word pair — the picker treats each of those as its own title.
     */
    const honorPickerList = useMemo(() => {
        if (!honorLibrary) return { items: [] as HonorPickerItem[], total: 0 };
        const query = honorQuery.trim().toLowerCase();
        const items: HonorPickerItem[] = [];
        for (const honor of honorLibrary.ordered) {
            const group = honorLibrary.groupById.get(honor.groupId);
            if (honorType !== "all" && (group?.honorType ?? "") !== honorType) continue;
            if (
                query &&
                !honorName(honor).toLowerCase().includes(query) &&
                !(group?.name ?? "").toLowerCase().includes(query)
            ) {
                continue;
            }
            const combinations = pickerCombinations(honor);
            if (combinations.length === 0) {
                items.push({ key: String(honor.id), honor, style: null });
                continue;
            }
            for (const [index, style] of combinations.entries()) {
                items.push({
                    key: `${honor.id}-${style.backgroundId ?? 0}-${style.wordId ?? 0}`,
                    honor,
                    style,
                    isDefaultStyle: index === 0,
                });
            }
        }
        return { items: items.slice(0, honorLimit), total: items.length };
    }, [honorLibrary, honorQuery, honorType, honorLimit, pickerCombinations]);

    const selectedCharacterId = editable ? partCharacter(parts, activePart) : singleCharacterId;

    /**
     * The picker fills one slot at a time, and a sub slot draws the smaller badge — so its rows
     * must preview that badge instead of the main one, or what you pick is not what you see.
     */
    const honorPickerSub = (honorPickerSlot ?? 0) > 0;

    /** The label of one row of the randomise scope panel. */
    const randomTargetLabel = (target: RandomTarget): string => {
        if (target === "frame") return t("page.playerFrames.random.frame");
        if (target === "card") return t("page.playerFrames.card.title");
        if (target === "honorMain") return t("page.playerFrames.honor.slotMain");
        return t("page.playerFrames.honor.slotSub", { index: formatNumber(target === "honorSub1" ? 1 : 2) });
    };

    /** Escape closes the scope panel, like any other popup. */
    useEffect(() => {
        if (!randomScopeOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setRandomScopeOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [randomScopeOpen]);

    /**
     * The three honor slots, shared by both layouts. The medallion shows the title as it currently
     * looks; the four style combinations are chosen in the picker, next to the titles themselves.
     */
    const renderHonorSlots = () => (
        <div className="flex flex-col gap-2">
            {Array.from({ length: HONOR_SLOT_COUNT }, (_unused, slot) => {
                const honor = honorSlotHonors[slot];
                const style = honorStyles[slot] ?? EMPTY_HONOR_STYLE;
                const sub = slot > 0;
                const group = honor ? honorLibraryForSlot(slot)?.groupById.get(honor.groupId) : undefined;
                return (
                    <div key={slot} className="flex flex-col gap-1.5">
                        <button
                            type="button"
                            onClick={() => openHonorPicker(slot)}
                            className="state-layer focus-ring flex items-center gap-3 rounded-md3-md px-1 py-1 text-left"
                        >
                            <span className="w-16 shrink-0 type-label-m text-on-surface-variant">
                                {slot === 0
                                    ? t("page.playerFrames.honor.slotMain")
                                    : t("page.playerFrames.honor.slotSub", { index: formatNumber(slot) })}
                            </span>
                            {honor ? (
                                <HonorThumb
                                    honor={honor}
                                    honorGroup={group}
                                    honorLevel={honorLevels[slot] ?? undefined}
                                    sub={sub}
                                    source={honorSourceForSlot(slot)}
                                    width={honorThumbWidth(171, sub)}
                                    fluid
                                    honorBackgroundId={supportsHonorStyle(honor, group) ? style.backgroundId : null}
                                    honorWordId={supportsHonorStyle(honor, group) ? style.wordId : null}
                                />
                            ) : (
                                <span className="flex h-8 min-w-0 flex-1 items-center type-body-s text-on-surface-variant">
                                    {t("page.playerFrames.honor.none")}
                                </span>
                            )}
                        </button>
                    </div>
                );
            })}
        </div>
    );

    return (
        <PageContainer wide>
            <PageHeader
                title={t("page.playerFrames.title")}
                highlight={t("page.playerFrames.titleHighlight")}
                description={t("page.playerFrames.description")}
                actions={
                    <>
                        {/* One button either way: with an account it syncs that account's data, and
                            without one it says so and points at /account, the only place accounts are
                            added (and where signing in brings them back). */}
                        <Button variant="tonal" size="s" icon={mdPerson} onClick={useMyAccount} disabled={isFilling}>
                            {isFilling
                                ? t("page.playerFrames.account.reading")
                                : t("page.playerFrames.account.useMine")}
                        </Button>
                        <Button variant="text" size="s" icon={mdShuffle} onClick={randomize}>
                            {t("page.playerFrames.actions.random")}
                        </Button>
                        {/* The scope of the randomise button, anchored right under it: one switch per
                            piece, then the action itself. */}
                        <div className="relative">
                            <IconButton
                                icon={mdTune}
                                size="s"
                                variant={randomScopeOpen ? "filled" : "standard"}
                                label={t("page.playerFrames.random.title")}
                                aria-expanded={randomScopeOpen}
                                onClick={() => setRandomScopeOpen(open => !open)}
                            />
                            {randomScopeOpen && (
                                <>
                                    <div
                                        aria-hidden
                                        className="fixed inset-0 z-40 cursor-default"
                                        onClick={() => setRandomScopeOpen(false)}
                                    />
                                    <Surface
                                        tone="default"
                                        radius="lg"
                                        className="md3-menu-enter absolute right-0 top-full z-50 mt-2 w-72 origin-top-right p-2 shadow-elev-3"
                                    >
                                        {/* Every row keeps its own height and side padding, so the
                                            switches never line up into one continuous column. */}
                                        <div className="flex flex-col gap-1">
                                            {RANDOM_TARGETS.map(target => (
                                                <Switch
                                                    key={target}
                                                    className="state-layer min-h-12 rounded-md3-sm px-2"
                                                    checked={randomTargets.includes(target)}
                                                    onCheckedChange={checked =>
                                                        setRandomTargets(current => (
                                                            checked
                                                                ? [...current, target]
                                                                : current.filter(id => id !== target)
                                                        ))
                                                    }
                                                    label={randomTargetLabel(target)}
                                                />
                                            ))}
                                        </div>
                                        <div className="mt-2 border-t border-outline-variant pt-2">
                                            <Button
                                                variant="filled"
                                                size="s"
                                                fullWidth
                                                icon={mdShuffle}
                                                onClick={() => {
                                                    randomize();
                                                    setRandomScopeOpen(false);
                                                }}
                                            >
                                                {t("page.playerFrames.actions.random")}
                                            </Button>
                                        </div>
                                    </Surface>
                                </>
                            )}
                        </div>
                        <Button variant="text" size="s" icon={mdRestartAlt} onClick={reset}>
                            {t("page.playerFrames.actions.reset")}
                        </Button>
                    </>
                }
            />

            {status === "error" && (
                <ErrorState
                    title={t("page.playerFrames.failed")}
                    message={t("page.playerFrames.failedHint")}
                    retryLabel={t("common.action.retry")}
                    onRetry={() => setReloadToken(token => token + 1)}
                    className="mb-4"
                />
            )}

            {!preview && status !== "error" && <LoadingState label={t("page.playerFrames.loading")} />}

            {preview && (
                orientation === "vertical" ? (
                    /* The preview area is the stage: a wide panel that fills the first screen, with the
                       card centred inside at the size it always had. Growing the panel (not the card)
                       is what "a bigger preview area" means here. */
                    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
                        <div className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-2">
                    <SectionCard
                        title={t("page.playerFrames.preview.title")}
                        className="xl:flex xl:min-h-[calc(100dvh-11rem)] xl:flex-col"
                        bodyClassName="flex min-h-0 flex-1 flex-col"
                        actions={
                            <>
                                <SegmentedButton
                                    options={orientationOptions}
                                    value={orientation}
                                    onValueChange={value => setOrientation(value as PlayerFrameOrientation)}
                                    density={-2}
                                />
                                <IconButton
                                    icon={mdDownload}
                                    size="xs"
                                    variant="standard"
                                    label={t("page.playerFrames.actions.download")}
                                    disabled={isExporting}
                                    onClick={() => void download()}
                                />
                            </>
                        }
                    >
                        {/* The stage sizes itself to the content: the portrait card keeps a card-like
                            width, the very wide friend row uses every pixel the column gives it. */}
                        <div className="flex min-h-0 w-full flex-1 items-center justify-center py-1">
                            <FrameCanvas
                                preview={preview}
                                showFrame={showFrame}
                                label={t(
                                    orientation === "vertical"
                                        ? "page.playerFrames.preview.vertical"
                                        : "page.playerFrames.preview.horizontal",
                                )}
                                className={orientation === "vertical" ? "mx-auto max-w-[19rem]" : "w-full"}
                            />
                        </div>
                    </SectionCard>
                        </div>
                        <div className="grid min-w-0 gap-4 [&>section]:min-w-0 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                        <div className="flex min-w-0 flex-col gap-4">
                        <SectionCard title={t("page.playerFrames.family.title")}>
                            <SegmentedButton
                                options={kindOptions}
                                value={frameKindValue}
                                onValueChange={onFrameKindChange}
                                className="w-full"
                            />
                            {showFrame && tierOptions.length > 1 && (
                                <div className="mt-4">
                                    <div className="mb-2 type-label-l text-on-surface-variant">
                                        {t("page.playerFrames.tier.title")}
                                    </div>
                                    <SegmentedButton
                                        options={tierOptions}
                                        value={String(activeTier ?? "")}
                                        onValueChange={value => setTier(Number(value))}
                                        className="w-full"
                                    />
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard title={t("page.playerFrames.characters.title")} bodyClassName="pt-0">
                            {partTabs}
                            <div className={cn("mb-2 type-label-l text-on-surface-variant", editable ? "mt-3" : "mt-1")}>
                                {t(
                                    editable
                                        ? "page.playerFrames.characters.hintCombination"
                                        : "page.playerFrames.characters.hintSingle",
                                )}
                            </div>
                            {/* Small tiles: the face is all that has to be recognised, so they stay
                                ~46px and the 26 characters fit in a couple of rows. */}
                            <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
                                {CHARACTER_IDS.map(characterId => {
                                    const selected = selectedCharacterId === characterId;
                                    const name = characterName(characterId);
                                    return (
                                        <button
                                            key={characterId}
                                            type="button"
                                            aria-pressed={selected}
                                            aria-label={name}
                                            title={name}
                                            onClick={() => setCharacter(characterId)}
                                            className={cn(
                                                // The client's part grid: a rounded tile in the character's own colour
                                                // with the face in a white-ringed circle at its top-left corner.
                                                "state-layer focus-ring relative aspect-square rounded-md3-sm",
                                                selected && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
                                            )}
                                            style={{ backgroundColor: characterColor(characterId) }}
                                        >
                                            <span className="absolute top-[8%] left-[8%] block h-[46%] w-[46%] overflow-hidden rounded-full ring-1 ring-white/80">
                                                <img
                                                    src={getCharacterIconUrl(characterId)}
                                                    alt=""
                                                    loading="lazy"
                                                    className="h-full w-full object-cover"
                                                />
                                            </span>
                                            {selected && (
                                                <span className="absolute right-1 bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-on-primary">
                                                    <Icon path={mdCheck} size={12} />
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </SectionCard>
                        </div>

                        <div className="flex min-w-0 flex-col gap-4">
                        <SectionCard
                            title={t("page.playerFrames.card.title")}
                            actions={
                                <IconButton
                                    icon={mdEdit}
                                    size="xs"
                                    variant="standard"
                                    label={t("page.playerFrames.card.pick")}
                                    onClick={() => setCardPickerOpen(true)}
                                />
                            }
                        >
                            <button
                                type="button"
                                onClick={() => setCardPickerOpen(true)}
                                className="state-layer focus-ring flex w-full items-center gap-3 rounded-md3-md text-left"
                            >
                                {activeCard ? (
                                    <img
                                        src={getCardThumbnailUrl(cardCharacterId, activeCard.assetbundleName, effectiveTrained, cardIndex.source)}
                                        alt=""
                                        loading="lazy"
                                        className="h-16 w-16 shrink-0 rounded-md3-sm object-cover"
                                    />
                                ) : (
                                    <span className="h-16 w-16 shrink-0 rounded-md3-sm bg-surface-container-high" />
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate type-body-m text-on-surface">
                                        {activeCard?.prefix ?? t("page.playerFrames.card.empty")}
                                    </span>
                                    <span className="block type-body-s text-on-surface-variant">
                                        {characterName(cardCharacterId)}
                                    </span>
                                </span>
                            </button>
                            <div className="mt-3">
                                <SegmentedButton
                                    options={[
                                        {
                                            value: "untrained",
                                            label: t("page.playerFrames.card.untrained"),
                                            // A card that starts trained has only the trained face.
                                            disabled: cardBornTrained,
                                        },
                                        {
                                            value: "trained",
                                            label: t("page.playerFrames.card.trained"),
                                            // 1*/2* and birthday cards ship no after-training art.
                                            disabled: !cardSupportsTraining,
                                        },
                                    ]}
                                    value={effectiveTrained ? "trained" : "untrained"}
                                    onValueChange={value => setTrained(value === "trained")}
                                    density={-2}
                                    className="w-full"
                                />
                            </div>
                            {cardNumberControls}
                        </SectionCard>

                        <SectionCard title={t("page.playerFrames.honor.title")}>
                            {renderHonorSlots()}
                        </SectionCard>
                        </div>
                        </div>
                    </div>
                ) : (
                    /* Friend row: it is more than ten times wider than it is tall, so it takes the
                       whole page width on top and the controls sit beneath it in a grid. */
                    <div className="flex flex-col gap-4">
                        <SectionCard
                    title={t("page.playerFrames.preview.title")}
                    actions={
                        <>
                            <SegmentedButton
                                options={orientationOptions}
                                value={orientation}
                                onValueChange={value => setOrientation(value as PlayerFrameOrientation)}
                                density={-2}
                            />
                            <IconButton
                                icon={mdDownload}
                                size="xs"
                                variant="standard"
                                label={t("page.playerFrames.actions.download")}
                                disabled={isExporting}
                                onClick={() => void download()}
                            />
                        </>
                    }
                >
                    {/* The stage sizes itself to the content: the portrait card keeps a card-like
                        width, the very wide friend row uses every pixel the column gives it. */}
                    <div className="flex min-h-0 w-full flex-1 items-center justify-center py-1">
                        <FrameCanvas
                            preview={preview}
                            showFrame={showFrame}
                            label={t("page.playerFrames.preview.horizontal")}
                            className="w-full"
                        />
                    </div>
                </SectionCard>

                        {/* The friend-row controls follow the client's own layout: the frame family and
                            the honors stacked on the left, the card plate in a narrow middle column and
                            the character grid taking the rest of the row. Placement is explicit so the
                            grid never stretches a short card to the height of the character grid. */}
                        <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,2.4fr)]">
                    <SectionCard
                        title={t("page.playerFrames.family.title")}
                        className="xl:col-start-1 xl:row-start-1"
                    >
                        <SegmentedButton
                            options={kindOptions}
                            value={frameKindValue}
                            onValueChange={onFrameKindChange}
                            className="w-full"
                        />
                        {showFrame && tierOptions.length > 1 && (
                            <div className="mt-4">
                                <div className="mb-2 type-label-l text-on-surface-variant">
                                    {t("page.playerFrames.tier.title")}
                                </div>
                                <SegmentedButton
                                    options={tierOptions}
                                    value={String(activeTier ?? "")}
                                    onValueChange={value => setTier(Number(value))}
                                    className="w-full"
                                />
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard
                        title={t("page.playerFrames.card.title")}
                        className="xl:col-start-2 xl:row-span-2 xl:row-start-1"
                        actions={
                            <IconButton
                                icon={mdEdit}
                                size="xs"
                                variant="standard"
                                label={t("page.playerFrames.card.pick")}
                                onClick={() => setCardPickerOpen(true)}
                            />
                        }
                    >
                        <button
                            type="button"
                            onClick={() => setCardPickerOpen(true)}
                            className="state-layer focus-ring flex w-full items-center gap-3 rounded-md3-md text-left"
                        >
                            {activeCard ? (
                                <img
                                    src={getCardThumbnailUrl(cardCharacterId, activeCard.assetbundleName, effectiveTrained, cardIndex.source)}
                                    alt=""
                                    loading="lazy"
                                    className="h-16 w-16 shrink-0 rounded-md3-sm object-cover"
                                />
                            ) : (
                                <span className="h-16 w-16 shrink-0 rounded-md3-sm bg-surface-container-high" />
                            )}
                            <span className="min-w-0 flex-1">
                                <span className="block truncate type-body-m text-on-surface">
                                    {activeCard?.prefix ?? t("page.playerFrames.card.empty")}
                                </span>
                                <span className="block type-body-s text-on-surface-variant">
                                    {characterName(cardCharacterId)}
                                </span>
                            </span>
                        </button>
                        <div className="mt-3">
                            <SegmentedButton
                                options={[
                                    {
                                        value: "untrained",
                                        label: t("page.playerFrames.card.untrained"),
                                        disabled: cardBornTrained,
                                    },
                                    {
                                        value: "trained",
                                        label: t("page.playerFrames.card.trained"),
                                        disabled: !cardSupportsTraining,
                                    },
                                ]}
                                value={effectiveTrained ? "trained" : "untrained"}
                                onValueChange={value => setTrained(value === "trained")}
                                density={-2}
                                className="w-full"
                            />
                        </div>
                        {cardNumberControls}
                    </SectionCard>

                    <SectionCard
                        title={t("page.playerFrames.characters.title")}
                        bodyClassName="pt-0"
                        className="xl:col-start-3 xl:row-span-2 xl:row-start-1"
                    >
                        {partTabs}
                        <div className={cn("mb-2 type-label-l text-on-surface-variant", editable ? "mt-3" : "mt-1")}>
                            {t(
                                editable
                                    ? "page.playerFrames.characters.hintCombination"
                                    : "page.playerFrames.characters.hintSingle",
                            )}
                        </div>
                        {/* Eight per row on wide screens: auto-fill only would spread the 26 faces
                            over two very long rows, so the block is kept roughly square instead. */}
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5 xl:grid-cols-8">
                            {CHARACTER_IDS.map(characterId => {
                                const selected = selectedCharacterId === characterId;
                                const name = characterName(characterId);
                                return (
                                    <button
                                        key={characterId}
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={name}
                                        title={name}
                                        onClick={() => setCharacter(characterId)}
                                        className={cn(
                                            // The client's part grid: a rounded tile in the character's own colour
                                            // with the face in a white-ringed circle at its top-left corner.
                                            "state-layer focus-ring relative aspect-square rounded-md3-sm",
                                            selected && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
                                        )}
                                        style={{ backgroundColor: characterColor(characterId) }}
                                    >
                                        <span className="absolute top-[8%] left-[8%] block h-[46%] w-[46%] overflow-hidden rounded-full ring-1 ring-white/80">
                                            <img
                                                src={getCharacterIconUrl(characterId)}
                                                alt=""
                                                loading="lazy"
                                                className="h-full w-full object-cover"
                                            />
                                        </span>
                                        {selected && (
                                            <span className="absolute right-1 bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-on-primary">
                                                <Icon path={mdCheck} size={12} />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </SectionCard>

                    <SectionCard
                        title={t("page.playerFrames.honor.title")}
                        className="xl:col-start-1 xl:row-start-2"
                    >
                        {renderHonorSlots()}
                    </SectionCard>
                        </div>
                    </div>
                )
            )}

            <Dialog
                isOpen={cardPickerOpen}
                onClose={() => setCardPickerOpen(false)}
                title={t("page.playerFrames.card.pick")}
                supportingText={characterName(pickerCharacter)}
                size="xl"
                // These pickers are transient UI, not a navigable state: a history round trip would
                // restore the URL snapshot and undo the page's own query-param sync.
                syncHistory={false}
            >
                {/* Search and the trained/untrained switch share a row: "after training" both draws
                    the trained face and hides the cards that never had one. */}
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <TextField
                        value={pickerQuery}
                        onValueChange={setPickerQuery}
                        placeholder={t("page.playerFrames.card.searchPlaceholder")}
                        className="w-full sm:max-w-xs"
                    />
                    <SegmentedButton
                        value={trained ? "trained" : "untrained"}
                        onValueChange={value => setTrained(value === "trained")}
                        options={[
                            { value: "untrained", label: t("page.playerFrames.card.untrained") },
                            { value: "trained", label: t("page.playerFrames.card.trained") },
                        ]}
                    />
                    {pickerFiltersActive && (
                        <button
                            type="button"
                            onClick={resetPickerFilters}
                            className="state-layer focus-ring h-8 shrink-0 cursor-pointer rounded-full px-3 type-label-l text-primary sm:ml-auto"
                        >
                            {t("common.filter.reset")}
                        </button>
                    )}
                </div>
                {/* Same filter language as the cards page. Units, rarity and attribute share the top
                    row — together they fit the dialog's width — and the 26 character faces keep a
                    row of their own under them, narrowed by the units above. */}
                <div className="mb-4 space-y-4">
                    <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
                    <FilterSection label={t("common.filter.unit")}>
                        <div className="flex flex-wrap gap-2">
                            {UNIT_DATA.map(unit => {
                                const selected = pickerUnitIds.includes(unit.id);
                                const unitLabel = t(UNIT_ID_LABEL_KEYS[unit.id] ?? `common.units.${unit.id}`);
                                return (
                                    <button
                                        key={unit.id}
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={unitLabel}
                                        title={unitLabel}
                                        onClick={() => togglePickerUnit(unit.id)}
                                        className={cn(
                                            "state-layer focus-ring cursor-pointer rounded-md3-md border p-1.5 transition-[background-color,border-radius] duration-200 ease-md3-standard",
                                            selected
                                                ? "rounded-md3-lg border-transparent bg-secondary-container ring-2 ring-primary"
                                                : "border-transparent bg-surface-container-high",
                                        )}
                                    >
                                        <img
                                            src={`/data/icon/${UNIT_ICON_FILES[unit.id]}`}
                                            alt=""
                                            loading="lazy"
                                            className="block h-8 w-8 object-contain"
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </FilterSection>
                    <FilterSection label={t("common.filter.rarity")}>
                        <div className="flex flex-wrap gap-2">
                            {PICKER_RARITIES.map(({ type, stars }) => {
                                const selected = pickerRarities.includes(type);
                                const label = stars === 0 ? t("page.playerFrames.card.birthday") : `${stars}★`;
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={label}
                                        title={label}
                                        onClick={() => togglePickerValue(pickerRarities, setPickerRarities, type)}
                                        className={`h-9 !gap-0.5 !px-2.5 ${getFilterChipStateClasses(selected)}`}
                                    >
                                        {stars === 0 ? (
                                            <img
                                                src="/data/icon/birthday.webp"
                                                alt=""
                                                loading="lazy"
                                                className="block h-4 w-4 object-contain"
                                            />
                                        ) : (
                                            Array.from({ length: stars }).map((_star, index) => (
                                                <img
                                                    key={index}
                                                    src="/data/icon/star.webp"
                                                    alt=""
                                                    loading="lazy"
                                                    className="block h-3 w-3 object-contain"
                                                />
                                            ))
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </FilterSection>
                    <FilterSection label={t("common.filter.attribute")}>
                        <div className="flex flex-wrap gap-2">
                            {PICKER_ATTRIBUTES.map(attr => (
                                <button
                                    key={attr}
                                    type="button"
                                    aria-pressed={pickerAttrs.includes(attr)}
                                    aria-label={ATTR_NAMES[attr]}
                                    title={ATTR_NAMES[attr]}
                                    onClick={() => togglePickerValue(pickerAttrs, setPickerAttrs, attr)}
                                    className={`!p-1.5 ${getFilterChipStateClasses(pickerAttrs.includes(attr))}`}
                                >
                                    <img
                                        src={getAttrIconUrl(attr, source)}
                                        alt=""
                                        loading="lazy"
                                        className="block h-6 w-6 object-contain"
                                    />
                                </button>
                            ))}
                        </div>
                    </FilterSection>
                    </div>
                    <FilterSection label={t("common.filter.character")}>
                        <div className="flex flex-wrap gap-2">
                            {pickerCharacterIds.map(characterId => {
                                const selected = pickerCharacter === characterId;
                                const name = characterName(characterId);
                                return (
                                    <button
                                        key={characterId}
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={name}
                                        title={name}
                                        onClick={() => setPickerCharacterId(characterId)}
                                        className={cn(
                                            "focus-ring relative cursor-pointer rounded-full p-0.5 transition-[background-color,box-shadow,opacity] duration-200 ease-md3-standard",
                                            selected
                                                ? "z-10 bg-secondary-container ring-2 ring-primary"
                                                : "opacity-80 ring-2 ring-transparent hover:opacity-100 hover:ring-outline-variant",
                                        )}
                                    >
                                        <span className="block h-10 w-10 overflow-hidden rounded-full bg-surface-container-highest">
                                            <img
                                                src={getCharacterIconUrl(characterId)}
                                                alt=""
                                                loading="lazy"
                                                className="h-full w-full object-cover"
                                            />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </FilterSection>
                </div>
                {cardOptions.length === 0 ? (
                    <p className="type-body-m text-on-surface-variant">{t("page.playerFrames.card.empty")}</p>
                ) : pickerCards.length === 0 ? (
                    <p className="type-body-m text-on-surface-variant">{t("page.playerFrames.card.noResult")}</p>
                ) : (
                    // Card art renders at the client's own 156px thumbnail size: a 6-column grid in the
                    // wide dialog keeps each face at that size instead of stretching a small one.
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
                        {pickerCards.map(card => {
                            const selected = activeCard?.id === card.id;
                            return (
                                <button
                                    key={card.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => {
                                        setSelectedCardId(card.id);
                                        // Chosen by hand: the card alone follows the page's server, and
                                        // the titles the account sent stay as they are.
                                        setCardPickerOpen(false);
                                    }}
                                    className={cn(
                                        "state-layer focus-ring rounded-md3-md",
                                        selected && "ring-2 ring-primary",
                                    )}
                                >
                                    <SekaiCardThumbnail
                                        card={card as unknown as ICardInfo}
                                        trained={getCardDefaultTrainedStatus(card) || (trained && hasTrainedFace(card))}
                                        assetSource={source}
                                        className="w-full"
                                    />
                                    <span className="block truncate px-1 py-0.5 type-label-s text-on-surface-variant">
                                        {card.prefix}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </Dialog>

            <Dialog
                isOpen={honorPickerSlot !== null}
                onClose={() => setHonorPickerSlot(null)}
                title={t("page.playerFrames.honor.pick")}
                size="lg"
                syncHistory={false}
                actions={
                    <Button variant="text" onClick={() => chooseHonor(null)}>
                        {t("page.playerFrames.honor.none")}
                    </Button>
                }
            >
                <TextField
                    value={honorQuery}
                    onValueChange={value => {
                        setHonorQuery(value);
                        setHonorLimit(HONOR_PAGE_SIZE);
                    }}
                    placeholder={t("page.playerFrames.honor.searchPlaceholder")}
                    className="mb-3 w-full"
                />
                {/* The client groups its honor list by family; without the filter the picker would
                    open on a few thousand titles of every kind. */}
                {honorTypeOptions.length > 1 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                        {[{ type: "all", count: honorTypeOptions.reduce((sum, item) => sum + item.count, 0) }, ...honorTypeOptions].map(
                            option => {
                                const selected = honorType === option.type;
                                return (
                                    <button
                                        key={option.type}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => {
                                            setHonorType(option.type);
                                            setHonorLimit(HONOR_PAGE_SIZE);
                                        }}
                                        className={cn(
                                            "state-layer focus-ring shrink-0 rounded-md3-s border px-2.5 py-1 type-label-m transition-colors",
                                            selected
                                                ? "border-transparent bg-secondary-container text-on-secondary-container"
                                                : "border-outline-variant text-on-surface-variant",
                                        )}
                                    >
                                        {option.type === "all"
                                            ? t("common.filter.all")
                                            : honorTypeLabel(t, option.type)}
                                        <span className="ml-1 type-label-s opacity-70">
                                            {formatNumber(option.count)}
                                        </span>
                                    </button>
                                );
                            },
                        )}
                    </div>
                )}
                {honorPickerList.total === 0 ? (
                    <p className="type-body-m text-on-surface-variant">{t("page.playerFrames.honor.noResult")}</p>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                            {honorPickerList.items.map(item => {
                                const { honor, style: combination } = item;
                                const slotStyle = honorPickerSlot === null
                                    ? EMPTY_HONOR_STYLE
                                    : honorStyles[honorPickerSlot] ?? EMPTY_HONOR_STYLE;
                                const slotHonorId = honorPickerSlot === null ? null : effectiveHonorIds[honorPickerSlot] ?? null;
                                const stylePicked = slotStyle.backgroundId !== null || slotStyle.wordId !== null;
                                const selected = combination === null || slotHonorId !== honor.id
                                    ? false
                                    : stylePicked
                                        ? (slotStyle.backgroundId ?? null) === combination.backgroundId &&
                                          (slotStyle.wordId ?? null) === combination.wordId
                                        : item.isDefaultStyle === true;
                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        aria-pressed={selected}
                                        title={combination?.label ?? honorName(honor)}
                                        onClick={() => chooseHonor(honor.id, combination ?? undefined)}
                                        className={cn(
                                            "state-layer focus-ring flex items-center gap-2 rounded-md3-sm px-1 py-1 text-left",
                                            selected && "ring-2 ring-primary",
                                        )}
                                    >
                                        <HonorThumb
                                            honor={honor}
                                            honorGroup={honorLibrary?.groupById.get(honor.groupId)}
                                            sub={honorPickerSub}
                                            source={honorSource}
                                            width={honorThumbWidth(132, honorPickerSub)}
                                            honorBackgroundId={combination?.backgroundId ?? null}
                                            honorWordId={combination?.wordId ?? null}
                                        />
                                        {combination === null ? (
                                            <span className="min-w-0 flex-1 truncate type-body-s text-on-surface">
                                                {honorName(honor)}
                                            </span>
                                        ) : (
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span className="truncate type-body-s text-on-surface">
                                                    {combination.wordName ?? honorName(honor)}
                                                </span>
                                                <span className="truncate type-label-s text-on-surface-variant">
                                                    {combination.backgroundName}
                                                </span>
                                            </span>
                                        )}
                                        <span className="shrink-0 rounded-full bg-surface-container-high px-1.5 type-label-s text-on-surface-variant">
                                            {honorRarityLabel(t, honor.honorRarity)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {honorPickerList.items.length < honorPickerList.total && (
                            <div className="mt-3 flex justify-center">
                                <Button
                                    variant="tonal"
                                    size="s"
                                    onClick={() => setHonorLimit(limit => limit + HONOR_PAGE_SIZE)}
                                >
                                    {t("page.playerFrames.honor.loadMore", {
                                        loaded: formatNumber(honorPickerList.items.length),
                                        total: formatNumber(honorPickerList.total),
                                    })}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </Dialog>

            {/* Nothing to sync: the same words the profile page uses when there is no account yet.
                Not a navigable state, and its action navigates on to /account: with a history entry
                of its own the close would `history.back()` over that navigation. */}
            <Dialog
                isOpen={noAccountOpen}
                onClose={() => setNoAccountOpen(false)}
                syncHistory={false}
                icon={mdPerson}
                title={t("page.account.profile.emptyTitle")}
                supportingText={t("page.playerFrames.account.noAccountBody")}
                actions={
                    <Button variant="filled" href="/account" onClick={() => setNoAccountOpen(false)}>
                        {t("page.account.profile.emptyAction")}
                    </Button>
                }
            />
            <Snackbar open={fillNotice !== null} message={fillNotice ?? ""} onClose={() => setFillNotice(null)} />
        </PageContainer>
    );
}

export default function PlayerFramesClient() {
    return (
        <MainLayout>
            <Suspense fallback={null}>
                <PlayerFramesContent />
            </Suspense>
        </MainLayout>
    );
}
