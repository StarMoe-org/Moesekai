"use client";
import React, { useState, useEffect, useId } from "react";
import { IBondsHonor, IGameCharaUnit } from "@/types/honor";
import {
    getBondsHonorCharacterUrl,
    getBondsHonorPatternUrl,
    getBondsHonorWordUrl,
    getHonorFrameUrl,
    getHonorLevelIconUrl,
} from "@/lib/assets";
import { getBondsHonorLayout } from "./bondsHonorLayout";
import { AssetSourceType } from "@/contexts/ThemeContext";

function useImageLoaded(url: string | undefined): boolean {
    const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!url) return;
        const targetUrl = url;
        const img = new Image();
        img.onload = () => setLoadedUrl(targetUrl);
        img.onerror = () => setLoadedUrl(prev => (prev === targetUrl ? null : prev));
        img.src = targetUrl;
        return () => { img.onload = null; img.onerror = null; };
    }, [url]);

    return !!url && loadedUrl === url;
}

interface LoadedImage {
    url: string;
    width: number;
    height: number;
}

/** The first of `urls` that loads, with its natural size; later URLs are fallbacks for missing ones. */
function useFirstLoadedImage(urls: string[]): LoadedImage | null {
    const key = urls.join("\n");
    const [loaded, setLoaded] = useState<(LoadedImage & { key: string }) | null>(null);

    useEffect(() => {
        if (!key) return;
        const candidates = key.split("\n");
        let cancelled = false;
        const img = new Image();
        const tryAt = (index: number) => {
            if (cancelled || index >= candidates.length) return;
            img.onload = () => {
                if (!cancelled) setLoaded({ key, url: candidates[index], width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = () => tryAt(index + 1);
            img.src = candidates[index];
        };
        tryAt(0);
        return () => { cancelled = true; img.onload = null; img.onerror = null; };
    }, [key]);

    return key && loaded?.key === key ? loaded : null;
}

interface BondsDegreeImageProps {
    bondsHonor: IBondsHonor;
    gameCharaUnits: IGameCharaUnit[];
    bondsHonorWordAssetbundleName?: string;
    viewType?: "normal" | "reverse";
    honorLevel?: number;
    sub?: boolean;
    source?: AssetSourceType;
    className?: string;
}

export default function BondsDegreeImage({
    bondsHonor,
    gameCharaUnits,
    bondsHonorWordAssetbundleName,
    viewType = "normal",
    honorLevel,
    sub = false,
    source = "main-jp",
    className,
}: BondsDegreeImageProps) {
    const rawId = useId();
    const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
    const roundedMaskId = `bonds-rounded-${bondsHonor.id}-${sub ? "s" : "m"}-${uid}`;
    const leftClipId = `bonds-left-clip-${bondsHonor.id}-${uid}`;
    const rightClipId = `bonds-right-clip-${bondsHonor.id}-${uid}`;
    const layout = getBondsHonorLayout(sub);
    const { width, height } = layout;

    // Find the two game character units
    const gcu1 = gameCharaUnits.find(g => g.id === bondsHonor.gameCharacterUnitId1);
    const gcu2 = gameCharaUnits.find(g => g.id === bondsHonor.gameCharacterUnitId2);

    // Determine left/right based on viewType
    const leftChara = viewType === "normal" ? gcu1 : gcu2;
    const rightChara = viewType === "normal" ? gcu2 : gcu1;

    // Character SD URLs
    const sdLeftUrl = leftChara ? getBondsHonorCharacterUrl(leftChara.gameCharacterId, source) : undefined;
    const sdRightUrl = rightChara ? getBondsHonorCharacterUrl(rightChara.gameCharacterId, source) : undefined;

    // Word image (the game shows the word only in the main slot), in the honor's rarity style.
    // If a server's storage has not caught up with a rarity yet, the low one stands in for it.
    const wordUrls: string[] = [];
    if (!sub && bondsHonorWordAssetbundleName) {
        wordUrls.push(getBondsHonorWordUrl(bondsHonorWordAssetbundleName, bondsHonor.honorRarity, source));
        const lowWordUrl = getBondsHonorWordUrl(bondsHonorWordAssetbundleName, "low", source);
        if (lowWordUrl !== wordUrls[0]) wordUrls.push(lowWordUrl);
    }

    // Frame, pattern and level icons — sprites from the client package
    const frameUrl = getHonorFrameUrl(bondsHonor.honorRarity, sub, source);
    const patternUrl = getBondsHonorPatternUrl(sub, source);
    const levelIconUrl = getHonorLevelIconUrl(false, source);
    const levelIcon6Url = getHonorLevelIconUrl(true, source);

    // Preload images
    const sdLeftLoaded = useImageLoaded(sdLeftUrl);
    const sdRightLoaded = useImageLoaded(sdRightUrl);
    const frameLoaded = useImageLoaded(frameUrl);
    const patternLoaded = useImageLoaded(patternUrl);

    // The word is drawn at its own size, centred
    const word = useFirstLoadedImage(wordUrls);

    if (!leftChara || !rightChara) return null;

    const wordOffsetX = word ? (width - word.width) / 2 : 0;
    const wordOffsetY = word ? (height - word.height) / 2 : 0;

    // Level icons
    const showLevel = honorLevel && honorLevel > 0 && bondsHonor.levels.length > 1;
    const levelCount = showLevel ? Math.min(5, honorLevel!) : 0;
    const level6Count = showLevel && honorLevel! > 5 ? honorLevel! - 5 : 0;

    const { leftBackground, leftCharacter, rightCharacter, leftCharacterClip, rightCharacterClip } = layout;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${width} ${height}`}
            className={className}
            style={{ width: "100%", height: "auto" }}
        >
            <defs>
                <mask id={roundedMaskId}>
                    <rect x="10" y="0" height={height} width={width - 20} rx={40} fill="white" />
                </mask>
                {leftCharacterClip && (
                    <clipPath id={leftClipId}>
                        <rect {...leftCharacterClip} />
                    </clipPath>
                )}
                {rightCharacterClip && (
                    <clipPath id={rightClipId}>
                        <rect {...rightCharacterClip} />
                    </clipPath>
                )}
            </defs>

            {/* Badge content, clipped to the badge outline */}
            <g mask={`url(#${roundedMaskId})`}>
                {/* Right colour fills the badge; the left colour overlaps it past the middle */}
                <rect x="0" y="0" height={height} width={width} fill={rightChara.colorCode} />
                <rect {...leftBackground} fill={leftChara.colorCode} />
                {/* Inner ring and shapes; a plain ring until the sprite is in */}
                {patternLoaded ? (
                    <image href={patternUrl} x="0" y="0" height={height} width={width} />
                ) : (
                    <rect
                        x="16" y="6"
                        height={68}
                        width={width - 32}
                        rx={34}
                        stroke="white"
                        strokeWidth={8}
                        fillOpacity={0}
                    />
                )}
                {/* Character SDs: the right one is drawn over the left one */}
                {sdLeftLoaded && (
                    <image
                        href={sdLeftUrl}
                        {...leftCharacter}
                        clipPath={leftCharacterClip ? `url(#${leftClipId})` : undefined}
                    />
                )}
                {sdRightLoaded && (
                    <image
                        href={sdRightUrl}
                        {...rightCharacter}
                        clipPath={rightCharacterClip ? `url(#${rightClipId})` : undefined}
                    />
                )}
            </g>

            {/* Frame overlay */}
            {frameLoaded && (
                <image href={frameUrl} x="0" y="0" height={height} width={width} />
            )}
            {/* Word (main slot only) */}
            {word && (
                <image href={word.url} x={wordOffsetX} y={wordOffsetY} width={word.width} height={word.height} />
            )}
            {/* Level icons (1-5) */}
            {levelIconUrl && levelCount > 0 && Array.from({ length: levelCount }).map((_, idx) => (
                <image key={`lv${idx}`} href={levelIconUrl} {...layout.levelIcon(idx)} />
            ))}
            {/* Level icons (6+) */}
            {levelIcon6Url && level6Count > 0 && Array.from({ length: level6Count }).map((_, idx) => (
                <image key={`lv6_${idx}`} href={levelIcon6Url} {...layout.levelIcon(idx)} />
            ))}
        </svg>
    );
}
