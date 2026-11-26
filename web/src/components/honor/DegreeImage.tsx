"use client";
import React, { useState, useEffect } from "react";
import { IHonorInfo, IHonorGroup } from "@/types/honor";
import { AssetSourceType } from "@/contexts/ThemeContext";
import { mdMilitaryTech } from "@/components/md3/icons";
import { useCharacterHonorStyles } from "@/hooks/useCharacterHonorStyles";
import { resolveCharacterHonorStyle } from "@/lib/character-honor-styles";
import { honorOverlayAnchor, resolveHonorArt, supportsHonorStyle, type HonorArtSpec } from "@/lib/honor-art";
import type { ServerSourceType } from "@/lib/fetch";

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

/**
 * Where the game pastes a placement plate, per family and per slot size — decided in
 * `honor-art.ts` so this renderer and the player-frame canvas agree. A plate that is already the
 * badge's own canvas is drawn over all of it instead (see the render below).
 */
function overlayAnchor(spec: HonorArtSpec, sub: boolean): { x: number; y: number } {
    if (!spec.overlay) return { x: 0, y: 0 };
    const anchor = honorOverlayAnchor(spec.overlay.kind, sub);
    return { x: anchor.x, y: anchor.y };
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

    // ── Character honor: chosen background style + word ──
    // The game draws a character honor from a background style, with the word laid over it on the
    // main slot. The legacy honor art is style 1 with the first word baked in and looks the same, so
    // the tables are only loaded when the player chose something else.
    const customStyle = supportsHonorStyle(honor, honorGroup) && (!!honorBackgroundId || !!honorWordId);
    const honorStyles = useCharacterHonorStyles(server, customStyle);
    const stylesPending = customStyle && !honorStyles;
    const style = honorStyles && customStyle
        ? resolveCharacterHonorStyle(honorStyles, honor.groupId, honorBackgroundId, honorWordId)
        : undefined;

    // Every asset decision — background, word, frame, placement plate, level badge — comes from the
    // shared resolver, so this component and the player-frame canvas cannot drift apart.
    const spec = resolveHonorArt({
        honor,
        group: honorGroup,
        level: honorLevel ?? null,
        sub,
        sources: [source],
        style: style?.background
            ? {
                  backgroundAssetbundleName: style.background.assetbundleName,
                  wordAssetbundleName: style.word?.assetbundleName ?? null,
              }
            : null,
    });

    // ── Background: the style pair, or the degree art with its word baked in ──
    const styleBgUrl = spec.styleBackgrounds[0];
    const wordUrl = spec.words[0];
    const legacyBgUrl = spec.backgrounds[0];
    const styleBgStatus = useImageStatus(styleBgUrl);
    const wordStatus = useImageStatus(wordUrl);
    const useStyle = spec.usesStyle && !!styleBgUrl && styleBgStatus !== "error" && wordStatus !== "error";
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
    // Some honors list assets the CDN never received (e.g. limitevent_v2);
    // without a stand-in the card shows an empty white strip.
    const bgMissing = bgStatus === "error" || bgStatus === "none";

    // ── Frame: the family's own sprite when it loads, else the default rarity one ──
    const defaultFrameUrl = spec.frames[spec.frames.length - 1];
    const customFrameUrl = spec.frames.length > 1 ? spec.frames[0] : undefined;
    const customFrameLoaded = useImageStatus(customFrameUrl) === "loaded";
    const frameUrl = customFrameUrl && customFrameLoaded ? customFrameUrl : defaultFrameUrl;

    // ── Placement plate: pasted at the game's anchor with its native pixel size; one that is
    //    already the badge's own canvas covers the whole badge ──
    const overlayUrl = spec.overlay?.urls[0];
    const overlayProbe = useImageProbe(overlayUrl);
    const overlayLoaded = overlayProbe.status === "loaded";
    const overlayCoversCanvas = overlayLoaded && overlayProbe.width === width && overlayProbe.height === height;
    const anchor = overlayAnchor(spec, sub);
    const overlayBox = {
        x: overlayCoversCanvas ? 0 : anchor.x,
        y: overlayCoversCanvas ? 0 : anchor.y,
        width: overlayCoversCanvas ? width : overlayProbe.width,
        height: overlayCoversCanvas ? height : overlayProbe.height,
    };

    // ── Level badge: a birthday title's flowers, or the shared star sprites ──
    const badgeUrl = spec.levelBadge?.urls[0];
    const badgeSixUrl = spec.levelBadge?.urlsSix?.[0];
    const badgeLoaded = useImageStatus(badgeUrl) === "loaded";
    const flowerCount = spec.levelBadge?.kind === "flower" && badgeLoaded ? spec.levelBadge.count : 0;
    const starCount = spec.levelBadge?.kind === "star" && badgeLoaded ? spec.levelBadge.count : 0;
    const levelCount = Math.min(5, starCount);
    const level6Count = starCount > 5 ? starCount - 5 : 0;

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
            {badgeUrl && flowerCount > 0 && Array.from({ length: flowerCount }).map((_, idx) => (
                <image
                    key={`flower${idx}`}
                    href={badgeUrl}
                    x={width / 2 - 9 * flowerCount + idx * 18}
                    y={height - 18}
                    height="18"
                    width="18"
                />
            ))}
            {/* Level icons (1-5) */}
            {badgeUrl && levelCount > 0 && Array.from({ length: levelCount }).map((_, idx) => (
                <image
                    key={`lv${idx}`}
                    href={badgeUrl}
                    x={50 + idx * 16}
                    y="64"
                    height="16"
                    width="16"
                />
            ))}
            {/* Level icons (6+) */}
            {badgeSixUrl && level6Count > 0 && Array.from({ length: level6Count }).map((_, idx) => (
                <image
                    key={`lv6_${idx}`}
                    href={badgeSixUrl}
                    x={50 + idx * 16}
                    y="64"
                    height="16"
                    width="16"
                />
            ))}
            {/* Rank / tier / scroll plate */}
            {overlayUrl && overlayLoaded && (
                <image
                    href={overlayUrl}
                    x={overlayBox.x}
                    y={overlayBox.y}
                    width={overlayBox.width}
                    height={overlayBox.height}
                />
            )}
        </svg>
    );
}
