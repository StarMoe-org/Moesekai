/**
 * The one place that decides which art an honor is drawn from.
 *
 * Honors are drawn by two renderers: `components/honor/DegreeImage.tsx` (SVG — the title lists, the
 * detail dialogs, the profile card) and the player-frame canvas in `lib/player-frame.ts`. Only the
 * drawing may differ between them; which background, word, frame, placement plate and level badge an
 * honor shows is decided here, once, from the masterdata.
 *
 * Masterdata writes `""` for the fields a family does not use and keeps the real value on the level
 * (`honor_3014_*` has an empty `honorRarity` and `"highest"` on each of its 100 levels), so every
 * lookup here treats an empty string as absent. Asset URLs are returned as ordered candidate lists:
 * the title's own region first, then the page's, and the caller takes the first that loads.
 */
import {
    getHonorBackgroundUrl,
    getHonorBgUrl,
    getHonorBirthdayLevelIconUrl,
    getHonorCustomFrameUrl,
    getHonorFrameUrl,
    getHonorLevelIconUrl,
    getHonorRankMatchBgUrl,
    getHonorRankMatchTierUrl,
    getHonorRankUrl,
    getHonorWordUrl,
} from "@/lib/assets";
import type { AssetSourceType } from "@/contexts/ThemeContext";

/** Honor rarities map to the suffix their bundles use: low → 1 … highest → 4. */
export const HONOR_RARITY_LEVEL: Record<string, number> = { low: 1, middle: 2, high: 3, highest: 4 };

/** Achievement groups that show the shared level stars (the others print their level differently). */
export const ACHIEVEMENT_LEVEL_WHITELIST: ReadonlySet<number> = new Set([33, 36, 37, 52, 72, 73, 74, 75, 76, 77]);

/** The part of an honor this module reads; `IHonorInfo` satisfies it. */
export interface HonorArtHonor {
    honorRarity?: string;
    assetbundleName?: string;
    honorMissionType?: string;
    levels?: readonly { level: number; honorRarity?: string; assetbundleName?: string }[];
}

/** The part of an honor group this module reads; `IHonorGroup` satisfies it. */
export interface HonorArtGroup {
    id?: number;
    honorType?: string;
    backgroundAssetbundleName?: string;
    frameName?: string;
}

/** A character honor's chosen style (honorBackgrounds / honorWords assetbundle names). */
export interface HonorArtStyle {
    backgroundAssetbundleName?: string | null;
    wordAssetbundleName?: string | null;
}

export interface HonorArtInput {
    honor: HonorArtHonor;
    group?: HonorArtGroup | null;
    /** The level to draw: the player's own, else the honor's first one. */
    level?: number | null;
    /** The compact (sub) slot: every family ships a 180x80 variant next to the 380x80 one. */
    sub: boolean;
    /** Asset regions to try, in order — the honor's own region first, then the page's. */
    sources: readonly AssetSourceType[];
    /** A character honor's style, when the tables are loaded and the honor supports one. */
    style?: HonorArtStyle | null;
}

export interface HonorArtLevelBadge {
    /** A birthday title marks its level with the frame's own flowers, every other family with stars. */
    readonly kind: "flower" | "star";
    readonly count: number;
    readonly urls: readonly string[];
    /** The 6+ star sprite; stars past the fifth use it. */
    readonly urlsSix?: readonly string[];
}

/** A placement plate pasted over the framed badge. */
export interface HonorArtOverlay {
    readonly kind: "event" | "rank_match" | "scroll";
    readonly urls: readonly string[];
}

/** The badge art a placement plate is positioned against: main 380x80, sub 180x80. */
export const HONOR_ART_CANVAS: Readonly<Record<"main" | "sub", { readonly width: number; readonly height: number }>> = {
    main: { width: 380, height: 80 },
    sub: { width: 180, height: 80 },
};

/**
 * Where the game pastes an honor's placement plate, in pixels of the badge art above.
 *
 * The plate sits on the badge's right half in the main slot, while every sub plate hangs on the
 * bottom edge instead — 42 + 38 (event plate) and 42 + 40 (rank-match tier) end flush with the art,
 * and the plate leaves the event title baked into the background readable at the top. Both renderers
 * position from here so the SVG and the player-frame canvas cannot disagree.
 */
export function honorOverlayAnchor(
    kind: HonorArtOverlay["kind"],
    sub: boolean,
): { readonly x: number; readonly y: number } {
    switch (kind) {
        case "rank_match":
            return sub ? { x: 17, y: 42 } : { x: 190, y: 0 };
        case "event":
            return sub ? { x: 34, y: 42 } : { x: 190, y: 0 };
        case "scroll":
            return sub ? { x: 37, y: 3 } : { x: 215, y: 3 };
    }
}

export interface HonorArtSpec {
    readonly rarity: string;
    readonly rarityLevel: number;
    /** The level the art was taken from; the level badge count follows it. */
    readonly level: number | null;
    /** True when the spec draws a character honor's background style under its word. */
    readonly usesStyle: boolean;
    /** The style art, tried before `backgrounds`; empty unless `usesStyle`. */
    readonly styleBackgrounds: readonly string[];
    /** The word drawn over the style art; only the main slot of a character honor has one. */
    readonly words: readonly string[];
    /** The degree art (word baked in), the fallback when the style art is not there. */
    readonly backgrounds: readonly string[];
    /** The rarity frame: the family's own one first, then the default sprite. */
    readonly frames: readonly string[];
    readonly overlay: HonorArtOverlay | null;
    readonly levelBadge: HonorArtLevelBadge | null;
}

/** Only the highest-rarity character honor is composed from a background style plus a word. */
export function supportsHonorStyle(
    honor: HonorArtHonor | null | undefined,
    group?: HonorArtGroup | null,
): boolean {
    return group?.honorType === "character" && honor?.honorRarity === "highest";
}

function uniqueUrls(values: readonly string[]): string[] {
    return [...new Set(values)];
}

/** The honor's rarity, reading the levels when the honor itself leaves it empty. */
export function honorRarityOf(honor: HonorArtHonor, level?: number | null): string {
    const levels = honor.levels ?? [];
    const entry = level == null ? undefined : levels.find(item => item.level === level);
    return honor.honorRarity || entry?.honorRarity || levels[0]?.honorRarity || "low";
}

/** The bundle the honor's own art lives in, reading the levels when the honor itself leaves it empty. */
export function honorBundleOf(honor: HonorArtHonor, level?: number | null): string | null {
    const levels = honor.levels ?? [];
    const entry = level == null ? undefined : levels.find(item => item.level === level);
    return honor.assetbundleName || entry?.assetbundleName || levels[0]?.assetbundleName || null;
}

export function resolveHonorArt(input: HonorArtInput): HonorArtSpec {
    const { honor, sub } = input;
    const group = input.group ?? null;
    const honorType = group?.honorType ?? "";
    const levels = honor.levels ?? [];
    const level = input.level ?? levels[0]?.level ?? null;
    const sources = [...new Set(input.sources)];
    const rarity = honorRarityOf(honor, level);
    const rarityLevel = HONOR_RARITY_LEVEL[rarity] ?? 1;
    const bundle = honorBundleOf(honor, level);
    const frameName = group?.frameName || null;
    const groupBackground = group?.backgroundAssetbundleName || null;

    // ── Degree art: the group's shared background, then the honor's own bundle ──
    // The second candidate only matters when the group's bundle is missing from the asset site, and
    // both renderers then fall through to the same art instead of one of them showing a placeholder.
    const backgroundBundles = honorType === "rank_match"
        ? [groupBackground || bundle]
        : [groupBackground, bundle];
    const backgrounds = uniqueUrls(sources.flatMap((source) =>
        backgroundBundles
            .filter((item): item is string => Boolean(item))
            .map(item => (honorType === "rank_match"
                ? getHonorRankMatchBgUrl(item, sub, source)
                : getHonorBgUrl(item, sub, source))),
    ));

    // ── A character honor's chosen style: a background plate plus a separate word ──
    const style = input.style ?? null;
    const styleBackground = style?.backgroundAssetbundleName || null;
    const styleWord = style?.wordAssetbundleName || null;
    // All or nothing: the legacy art already carries a word, and a style background without its
    // word would be blank, so the pair is only used when both halves exist for this slot.
    const usesStyle = honorType === "character" && !!styleBackground && (sub || !!styleWord);
    const styleBackgrounds = usesStyle
        ? uniqueUrls(sources.map(source => getHonorBackgroundUrl(styleBackground!, sub, source)))
        : [];
    const words = usesStyle && !sub && styleWord
        ? uniqueUrls(sources.map(source => getHonorWordUrl(styleWord, rarity, source)))
        : [];

    // ── Frame: the family's own bundle for the high rarities (birthday also ships the middle one),
    //    otherwise the default rarity sprite ──
    const customFrame = frameName && (rarityLevel >= 3 || (honorType === "birthday" && rarityLevel === 2))
        ? frameName
        : null;
    const frames = uniqueUrls([
        ...(customFrame ? sources.map(source => getHonorCustomFrameUrl(customFrame, rarity, sub, source)) : []),
        ...sources.map(source => getHonorFrameUrl(rarity, sub, source)),
    ]);

    // ── Placement plate ──
    let overlay: HonorArtOverlay | null = null;
    if (bundle) {
        if (honorType === "rank_match") {
            overlay = { kind: "rank_match", urls: uniqueUrls(sources.map(source => getHonorRankMatchTierUrl(bundle, sub, source))) };
        } else if (honorType === "event" || honorType === "event_point") {
            overlay = { kind: "event", urls: uniqueUrls(sources.map(source => getHonorRankUrl(bundle, "rank", sub, source))) };
        } else if (honor.honorMissionType) {
            overlay = { kind: "scroll", urls: uniqueUrls(sources.map(source => getHonorRankUrl(bundle, "scroll", false, source))) };
        }
    }

    // ── Level badge ──
    const count = level ?? 0;
    let levelBadge: HonorArtLevelBadge | null = null;
    const starsAllowed = levels.length > 1;
    if (count > 0) {
        if (honorType === "birthday") {
            // A birthday badge says everything about the level through its flowers, so it is not
            // gated on the honor having several levels; the star families still are.
            if (frameName) {
                levelBadge = {
                    kind: "flower",
                    count,
                    urls: uniqueUrls(sources.map(source => getHonorBirthdayLevelIconUrl(frameName, rarity, source))),
                };
            }
        } else if (honorType === "event" || honorType === "rank_match") {
            // The event and rank-match badges print their rank, not their level.
            levelBadge = null;
        } else if (honorType === "achievement") {
            levelBadge = starsAllowed && group?.id !== undefined && ACHIEVEMENT_LEVEL_WHITELIST.has(group.id)
                ? starBadge(count, sources)
                : null;
        } else if (starsAllowed) {
            levelBadge = starBadge(count, sources);
        }
    }

    return {
        rarity,
        rarityLevel,
        level,
        usesStyle,
        styleBackgrounds,
        words,
        backgrounds,
        frames,
        overlay,
        levelBadge,
    };
}

function starBadge(count: number, sources: readonly AssetSourceType[]): HonorArtLevelBadge {
    return {
        kind: "star",
        count,
        urls: uniqueUrls(sources.map(source => getHonorLevelIconUrl(false, source))),
        urlsSix: uniqueUrls(sources.map(source => getHonorLevelIconUrl(true, source))),
    };
}
