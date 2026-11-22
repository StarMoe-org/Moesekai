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

function useImageSize(url: string | undefined): { width: number; height: number } | null {
    const [size, setSize] = useState<{ url: string; width: number; height: number } | null>(null);

    useEffect(() => {
        if (!url) return;
        const targetUrl = url;
        const img = new Image();
        img.onload = () => setSize({ url: targetUrl, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => setSize(prev => (prev?.url === targetUrl ? null : prev));
        img.src = targetUrl;
        return () => { img.onload = null; img.onerror = null; };
    }, [url]);

    if (!url || !size || size.url !== url) return null;
    return { width: size.width, height: size.height };
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

    // Word image URL (the game shows the word only in the main slot)
    const wordUrl = !sub && bondsHonorWordAssetbundleName
        ? getBondsHonorWordUrl(bondsHonorWordAssetbundleName, source)
        : undefined;

    // Frame, pattern and level icons — sprites from the client package
    const frameUrl = getHonorFrameUrl(bondsHonor.honorRarity, sub, source);
    const patternUrl = getBondsHonorPatternUrl(sub, source);
    const levelIconUrl = getHonorLevelIconUrl(false, source);
    const levelIcon6Url = getHonorLevelIconUrl(true, source);

    // Preload images
    const sdLeftLoaded = useImageLoaded(sdLeftUrl);
    const sdRightLoaded = useImageLoaded(sdRightUrl);
    const wordLoaded = useImageLoaded(wordUrl);
    const frameLoaded = useImageLoaded(frameUrl);
    const patternLoaded = useImageLoaded(patternUrl);

    // The word is drawn at its own size, centred
    const wordSize = useImageSize(wordUrl);

    if (!leftChara || !rightChara) return null;

    const wordOffsetX = wordSize ? (width - wordSize.width) / 2 : 0;
    const wordOffsetY = wordSize ? (height - wordSize.height) / 2 : 0;

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
            {wordLoaded && wordSize && wordUrl && (
                <image href={wordUrl} x={wordOffsetX} y={wordOffsetY} />
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
