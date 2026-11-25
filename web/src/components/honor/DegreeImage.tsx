"use client";
import React, { useState, useEffect } from "react";
import { IHonorInfo, IHonorGroup } from "@/types/honor";
import {
    getHonorBackgroundUrl,
    getHonorBgUrl,
    getHonorBirthdayLevelIconUrl,
    getHonorCustomFrameUrl,
    getHonorFrameUrl,
    getHonorLevelIconUrl,
    getHonorRankMatchTierUrl,
    getHonorRankUrl,
    getHonorRankMatchBgUrl,
    getHonorWordUrl,
} from "@/lib/assets";
import { AssetSourceType } from "@/contexts/ThemeContext";
import { mdMilitaryTech } from "@/components/md3/icons";
import { useCharacterHonorStyles } from "@/hooks/useCharacterHonorStyles";
import { resolveCharacterHonorStyle } from "@/lib/character-honor-styles";
import type { ServerSourceType } from "@/lib/fetch";

// Achievement group IDs that should show level icons
const ACHIEVEMENT_LEVEL_WHITELIST = new Set([33, 36, 37, 52, 72, 73, 74, 75, 76, 77]);

// Hook to preload an image and track success/failure
type ImageStatus = "none" | "loading" | "loaded" | "error";

interface ImageProbe {
    status: ImageStatus;
    /** The sprite's natural pixel size; 0 until it has loaded. */
    width: number;
    height: number;
}

const PROBE_NONE: ImageProbe = { status: "none", width: 0, height: 0 };
const PROBE_LOADING: ImageProbe = { status: "loading", width: 0, height: 0 };

/**
 * Preloads an overlay sprite and reports both whether it is usable and its natural size: the honour
 * layers keep their own pixel size, so their size decides how they are pasted.
 */
function useImageProbe(url: string | undefined): ImageProbe {
    const [settled, setSettled] = useState<{ url: string; ok: boolean; width: number; height: number } | null>(null);

    useEffect(() => {
        if (!url) return;
        const targetUrl = url;
        const img = new Image();
        img.onload = () => setSettled({ url: targetUrl, ok: true, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => setSettled({ url: targetUrl, ok: false, width: 0, height: 0 });
        img.src = targetUrl;
        return () => { img.onload = null; img.onerror = null; };
    }, [url]);

    if (!url) return PROBE_NONE;
    if (settled?.url !== url) return PROBE_LOADING;
    return { status: settled.ok ? "loaded" : "error", width: settled.width, height: settled.height };
}

function useImageStatus(url: string | undefined): ImageStatus {
    return useImageProbe(url).status;
}

interface DegreeImageProps {
    honor: IHonorInfo;
    honorGroup?: IHonorGroup;
    honorLevel?: number;
    sub?: boolean;
    source?: AssetSourceType;
    className?: string;
    /** A character honor's chosen background style (honorBackgrounds id); 0 or absent is the default. */
    honorBackgroundId?: number;
    /** A character honor's chosen word (honorWords id); 0 or absent is the default. */
    honorWordId?: number;
    /** The server whose masterdata the honor comes from; the current one when omitted. */
    server?: ServerSourceType;
}

export default function DegreeImage({
    honor,
    honorGroup,
    honorLevel,
    sub = false,
    source = "main-jp",
    className,
    honorBackgroundId,
    honorWordId,
    server,
}: DegreeImageProps) {
    const width = sub ? 180 : 380;
    const height = 80;
    const honorType = honorGroup?.honorType || "";

    // ── Resolve assetbundleName ──
    let bgAssetName = honor.assetbundleName;
    if (!bgAssetName && honorLevel && honor.levels[honorLevel - 1]?.assetbundleName) {
        bgAssetName = honor.levels[honorLevel - 1].assetbundleName;
    }
    if (!bgAssetName && honor.levels.length > 0 && honor.levels[0]?.assetbundleName) {
        bgAssetName = honor.levels[0].assetbundleName;
    }

    // ── Background URL ──
    let legacyBgUrl: string | undefined;
    if (honorType === "rank_match" && honorGroup?.backgroundAssetbundleName) {
        legacyBgUrl = getHonorRankMatchBgUrl(honorGroup.backgroundAssetbundleName, sub, source);
    } else if (honorGroup?.backgroundAssetbundleName) {
        legacyBgUrl = getHonorBgUrl(honorGroup.backgroundAssetbundleName, sub, source);
    } else if (bgAssetName) {
        legacyBgUrl = getHonorBgUrl(bgAssetName, sub, source);
    }

    // ── Frame URL ──
    const rarity = honor.honorRarity
        || (honorLevel ? honor.levels.find(l => l.level === honorLevel)?.honorRarity : undefined)
        || (honor.levels.length > 0 ? honor.levels[0]?.honorRarity : undefined)
        || "low";

    const rarityNumMap: Record<string, number> = { low: 1, middle: 2, high: 3, highest: 4 };
    const rarityNum = rarityNumMap[rarity] || 1;

    // ── Character honor: chosen background style + word ──
    // The game draws a character honor from a background style, with the word laid over it on
    // the main slot. The legacy honor art is style 1 with the first word baked in and looks the
    // same, so the tables are only loaded when the player chose something else.
    const customStyle = honorType === "character" && (!!honorBackgroundId || !!honorWordId);
    const honorStyles = useCharacterHonorStyles(server, customStyle);
    const stylesPending = customStyle && !honorStyles;
    const style = honorStyles
        ? resolveCharacterHonorStyle(honorStyles, honor.groupId, honorBackgroundId, honorWordId)
        : undefined;
    // All or nothing: the legacy art already carries a word, and a style background without
    // its word would be blank. Servers without the tables keep the legacy art.
    const styleBg = style?.background && (sub || style.word) ? style.background : undefined;
    const styleBgUrl = styleBg ? getHonorBackgroundUrl(styleBg.assetbundleName, sub, source) : undefined;
    const wordUrl = styleBg && !sub && style?.word ? getHonorWordUrl(style.word.assetbundleName, rarity, source) : undefined;

    // Custom frame bundles only ship the high/highest variants (birthday also has middle);
    // other rarities use the default frame, which is also the fallback when the custom one is missing.
    const defaultFrameUrl = getHonorFrameUrl(rarity, sub, source);
    const hasCustomFrame = !!honorGroup?.frameName
        && (rarityNum >= 3 || (honorType === "birthday" && rarityNum === 2));
    const customFrameUrl = hasCustomFrame
        ? getHonorCustomFrameUrl(honorGroup!.frameName!, rarity, sub, source)
        : undefined;
    // Birthday honors mark their level with the frame's own flower badges instead of the shared
    // level stars: one flower per level, laid out along the bottom centre of the badge.
    const birthdayFlowerUrl = honorType === "birthday" && honorGroup?.frameName
        ? getHonorBirthdayLevelIconUrl(honorGroup.frameName, rarity, source)
        : undefined;

    // ── Rank / tier overlay ──
    // Every family's placement plate is a separate sprite pasted over the assembled badge. The
    // anchors below are the game's own paste positions; each plate keeps its native pixel size,
    // except one that is already the badge's own canvas (World Link character plates ship as a
    // complete 380x80 / 180x80 overlay), which covers the whole badge.
    let rankUrl: string | undefined;
    let rankX = 0;
    let rankY = 0;
    if (honorType === "rank_match" && bgAssetName) {
        // The season bundle (`rank_live/honor/season_*`) only draws the banner: the tier plate lives
        // in the honor's own bundle and is pasted at (190, 0) main / (17, 42) sub.
        rankUrl = getHonorRankMatchTierUrl(bgAssetName, sub, source);
        rankX = sub ? 17 : 190;
        rankY = sub ? 42 : 0;
    } else if (honorType === "event" || honorType === "event_point") {
        if (bgAssetName) {
            rankUrl = getHonorRankUrl(bgAssetName, "rank", sub, source);
            rankX = sub ? 34 : 190;
        }
    } else if (honor.honorMissionType && bgAssetName) {
        // The mission scroll is one sprite for both sizes.
        rankUrl = getHonorRankUrl(bgAssetName, "scroll", false, source);
        rankX = sub ? 37 : 215;
        rankY = 3;
    }

    // ── Level icon logic ──
    const levelIconUrl = getHonorLevelIconUrl(false, source);
    const levelIcon6Url = getHonorLevelIconUrl(true, source);

    let shouldDrawLevel = false;
    /** Left edge of the first star badge; the level stars sit next to the honor's own art. */
    const levelIconX = 50;

    // Birthday flowers already say everything about the level, so they are not gated on the honor
    // having several levels; the star families still are.
    if (honorLevel && honorLevel > 0 && (honorType === "birthday" || honor.levels.length > 1)) {
        if (honorType === "birthday") {
            // Birthday: one flower per level, positioned around the badge's bottom centre.
            shouldDrawLevel = !!birthdayFlowerUrl;
        } else if (honorType === "event" || honorType === "rank_match") {
            // Event and rank_match: don't show level
            shouldDrawLevel = false;
        } else if (honorType === "achievement") {
            // Achievement: only show level if group ID is in whitelist
            if (honorGroup && ACHIEVEMENT_LEVEL_WHITELIST.has(honorGroup.id)) {
                shouldDrawLevel = true;
            }
        } else {
            // Default: show level
            shouldDrawLevel = true;
        }
    }

    // ── Preload images to hide 404s ──
    const styleBgStatus = useImageStatus(styleBgUrl);
    const wordStatus = useImageStatus(wordUrl);
    const useStyle = !!styleBgUrl && styleBgStatus !== "error" && wordStatus !== "error";
    const legacyStatus = useImageStatus(stylesPending || useStyle ? undefined : legacyBgUrl);
    const bgUrl = useStyle ? styleBgUrl : legacyBgUrl;
    let bgStatus: ImageStatus;
    if (stylesPending) {
        bgStatus = "loading";
    } else if (useStyle) {
        bgStatus = styleBgStatus === "loaded" && (!wordUrl || wordStatus === "loaded") ? "loaded" : "loading";
    } else {
        bgStatus = legacyStatus;
    }
    const bgLoaded = bgStatus === "loaded";
    const customFrameLoaded = useImageStatus(customFrameUrl) === "loaded";
    const frameUrl = customFrameUrl && customFrameLoaded ? customFrameUrl : defaultFrameUrl;
    const rankProbe = useImageProbe(rankUrl);
    const rankLoaded = rankProbe.status === "loaded";
    // A plate that already is the badge's own canvas is drawn over all of it; every other plate is
    // pasted at its anchor with its native pixel size.
    const rankCoversCanvas = rankLoaded && rankProbe.width === width && rankProbe.height === height;
    const rankBox = {
        x: rankCoversCanvas ? 0 : rankX,
        y: rankCoversCanvas ? 0 : rankY,
        width: rankCoversCanvas ? width : rankProbe.width,
        height: rankCoversCanvas ? height : rankProbe.height,
    };
    // Some honors list assets the CDN never received (e.g. limitevent_v2);
    // without a stand-in the card shows an empty white strip.
    const bgMissing = bgStatus === "error" || bgStatus === "none";

    // Birthday honors show their level as flowers, every other family as the shared star badges.
    const birthdayFlowerLoaded = useImageStatus(birthdayFlowerUrl) === "loaded";
    const drawFlowers = shouldDrawLevel && !!birthdayFlowerUrl && birthdayFlowerLoaded;
    const drawStars = shouldDrawLevel && !drawFlowers;

    // Level 1-5 icons and 6+ icons
    const levelCount = drawStars && honorLevel ? Math.min(5, honorLevel) : 0;
    const level6Count = drawStars && honorLevel && honorLevel > 5 ? honorLevel - 5 : 0;
    const flowerCount = drawFlowers && honorLevel ? honorLevel : 0;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${width} ${height}`}
            className={className}
            style={{ width: "100%", height: "auto" }}
        >
            {/* Placeholder while the background loads, or when it never will */}
            {!bgLoaded && (
                <rect x="0" y="0" width={width} height={height} rx="12" className="fill-surface-container-high" />
            )}
            {bgMissing && (
                <svg x={width / 2 - 16} y={height / 2 - 16} width="32" height="32" viewBox="0 -960 960 960">
                    <path d={mdMilitaryTech} className="fill-on-surface-variant" opacity="0.6" />
                </svg>
            )}
            {/* Background */}
            {bgUrl && bgLoaded && (
                <image
                    href={bgUrl}
                    x="0"
                    y="0"
                    height={height}
                    width={width}
                />
            )}
            {/* Character honor word, over its background style */}
            {useStyle && wordUrl && bgLoaded && (
                <image
                    href={wordUrl}
                    x="0"
                    y="0"
                    height={height}
                    width={width}
                />
            )}
            {/* Frame */}
            {frameUrl && (
                <image
                    href={frameUrl}
                    x="0"
                    y="0"
                    height={height}
                    width={width}
                />
            )}
            {/* Birthday level flowers: one per level, centred along the bottom edge */}
            {birthdayFlowerUrl && flowerCount > 0 && Array.from({ length: flowerCount }).map((_, idx) => (
                <image
                    key={`flower${idx}`}
                    href={birthdayFlowerUrl}
                    x={width / 2 - 9 * flowerCount + idx * 18}
                    y={height - 18}
                    height="18"
                    width="18"
                />
            ))}
            {/* Level icons (1-5) */}
            {levelIconUrl && levelCount > 0 && Array.from({ length: levelCount }).map((_, idx) => (
                <image
                    key={`lv${idx}`}
                    href={levelIconUrl}
                    x={levelIconX + idx * 16}
                    y="64"
                    height="16"
                    width="16"
                />
            ))}
            {/* Level icons (6+) */}
            {levelIcon6Url && level6Count > 0 && Array.from({ length: level6Count }).map((_, idx) => (
                <image
                    key={`lv6_${idx}`}
                    href={levelIcon6Url}
                    x={levelIconX + idx * 16}
                    y="64"
                    height="16"
                    width="16"
                />
            ))}
            {/* Rank / tier / scroll plate */}
            {rankUrl && rankLoaded && (
                <image
                    href={rankUrl}
                    x={rankBox.x}
                    y={rankBox.y}
                    width={rankBox.width}
                    height={rankBox.height}
                />
            )}
        </svg>
    );
}
