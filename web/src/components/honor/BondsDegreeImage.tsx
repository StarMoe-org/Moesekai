"use client";
import React, { useState, useEffect } from "react";
import { IBondsHonor, IGameCharaUnit } from "@/types/honor";
import { getBondsHonorCharacterUrl, getBondsHonorWordUrl, getHonorFrameUrl, getHonorLevelIconUrl } from "@/lib/assets";
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
    const width = sub ? 180 : 380;
    const height = 80;

    // Find the two game character units
    const gcu1 = gameCharaUnits.find(g => g.id === bondsHonor.gameCharacterUnitId1);
    const gcu2 = gameCharaUnits.find(g => g.id === bondsHonor.gameCharacterUnitId2);

    // Determine left/right based on viewType
    const leftChara = viewType === "normal" ? gcu1 : gcu2;
    const rightChara = viewType === "normal" ? gcu2 : gcu1;

    // Character SD URLs
    const sdLeftUrl = leftChara ? getBondsHonorCharacterUrl(leftChara.gameCharacterId, source) : undefined;
    const sdRightUrl = rightChara ? getBondsHonorCharacterUrl(rightChara.gameCharacterId, source) : undefined;

    // Word image URL
    const wordUrl = bondsHonorWordAssetbundleName
        ? getBondsHonorWordUrl(bondsHonorWordAssetbundleName, source)
        : undefined;

    // Frame and level icons — sprites from the client package
    const frameUrl = getHonorFrameUrl(bondsHonor.honorRarity, sub, source);
    const levelIconUrl = getHonorLevelIconUrl(false, source);
    const levelIcon6Url = getHonorLevelIconUrl(true, source);

    // Preload images
    const sdLeftLoaded = useImageLoaded(sdLeftUrl);
    const sdRightLoaded = useImageLoaded(sdRightUrl);
    const wordLoaded = useImageLoaded(wordUrl);
    const frameLoaded = useImageLoaded(frameUrl);

    // Get image sizes for positioning
    const sdLeftSize = useImageSize(sdLeftUrl);
    const sdRightSize = useImageSize(sdRightUrl);
    const wordSize = useImageSize(wordUrl);

    if (!leftChara || !rightChara) return null;

    // Calculate SD positions
    const scaleFactor = sub ? 1 / 1.35 : 1;

    const sdLeftW = sdLeftSize ? sdLeftSize.width * scaleFactor : 0;
    const sdLeftH = sdLeftSize ? sdLeftSize.height * scaleFactor : 0;
    const sdLeftX = sub ? 26 : 20;
    const sdLeftY = sdLeftSize ? (sub ? 77 : 93) - sdLeftH : 0;

    const sdRightW = sdRightSize ? sdRightSize.width * scaleFactor : 0;
    const sdRightH = sdRightSize ? sdRightSize.height * scaleFactor : 0;
    const sdRightX = (sub ? 160 : 360) - sdRightW;
    const sdRightY = sdRightSize ? (sub ? 78 : 93) - sdRightH : 0;

    // Word position (centered)
    const wordOffsetX = wordSize ? ((sub ? 180 : 380) - wordSize.width) / 2 : 0;
    const wordOffsetY = wordSize ? (80 - wordSize.height) / 2 : 0;

    // Level icons
    const showLevel = honorLevel && honorLevel > 0 && bondsHonor.levels.length > 1;
    const levelCount = showLevel ? Math.min(5, honorLevel!) : 0;
    const level6Count = showLevel && honorLevel! > 5 ? honorLevel! - 5 : 0;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${width} ${height}`}
            className={className}
            style={{ width: "100%", height: "auto" }}
        >
            {/* Masks */}
            <defs>
                <mask id={`bonds-rounded-${bondsHonor.id}-${sub ? "s" : "m"}`}>
                    <rect x="10" y="0" height={80} width={sub ? 160 : 360} rx={40} fill="white" />
                </mask>
                {sub && (
                    <>
                        <mask id={`bonds-left-crop-${bondsHonor.id}`}>
                            <rect x="0" y="0" height={80} width={90} fill="white" />
                        </mask>
                        <mask id={`bonds-right-crop-${bondsHonor.id}`}>
                            <rect x="90" y="0" height={80} width={90} fill="white" />
                        </mask>
                    </>
                )}
            </defs>

            {/* Inner content with rounded mask */}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox={`0 0 ${width} ${height}`}
                mask={`url(#bonds-rounded-${bondsHonor.id}-${sub ? "s" : "m"})`}
            >
                {/* Left background */}
                <rect
                    x="0" y="0"
                    height="80"
                    width={sub ? 90 : 190}
                    fill={leftChara.colorCode}
                />
                {/* Right background */}
                <rect
                    x={sub ? 90 : 190} y="0"
                    height="80"
                    width={sub ? 90 : 190}
                    fill={rightChara.colorCode}
                />
                {/* Inner white frame */}
                <rect
                    x="16" y="6"
                    height={68}
                    width={sub ? 148 : 348}
                    rx={34}
                    stroke="white"
                    strokeWidth={8}
                    fillOpacity={0}
                />
                {/* Left character SD */}
                {sdLeftLoaded && sdLeftSize && (
                    <image
                        href={sdLeftUrl}
                        x={sdLeftX}
                        y={sdLeftY}
                        height={sdLeftH}
                        width={sdLeftW}
                        mask={sub ? `url(#bonds-left-crop-${bondsHonor.id})` : undefined}
                    />
                )}
                {/* Right character SD */}
                {sdRightLoaded && sdRightSize && (
                    <image
                        href={sdRightUrl}
                        x={sdRightX}
                        y={sdRightY}
                        height={sdRightH}
                        width={sdRightW}
                        mask={sub ? `url(#bonds-right-crop-${bondsHonor.id})` : undefined}
                    />
                )}
                {/* Word image (only for main size) */}
                {!sub && wordLoaded && wordSize && wordUrl && (
                    <image
                        href={wordUrl}
                        x={wordOffsetX}
                        y={wordOffsetY}
                    />
                )}
                {/* Level icons (1-5) */}
                {levelIconUrl && levelCount > 0 && Array.from({ length: levelCount }).map((_, idx) => (
                    <image
                        key={`lv${idx}`}
                        href={levelIconUrl}
                        x={50 + idx * 16}
                        y={64}
                        height={sub ? 14 : 16}
                        width={sub ? 14 : 16}
                    />
                ))}
                {/* Level icons (6+) */}
                {levelIcon6Url && level6Count > 0 && Array.from({ length: level6Count }).map((_, idx) => (
                    <image
                        key={`lv6_${idx}`}
                        href={levelIcon6Url}
                        x={50 + idx * 16}
                        y={64}
                        height={sub ? 14 : 16}
                        width={sub ? 14 : 16}
                    />
                ))}
            </svg>

            {/* Frame overlay */}
            {frameLoaded && (
                <image
                    href={frameUrl}
                    x="0" y="0"
                    height="80"
                    width={width}
                />
            )}
        </svg>
    );
}
