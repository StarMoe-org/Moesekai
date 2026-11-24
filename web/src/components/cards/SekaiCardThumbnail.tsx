"use client";
import React, { memo, useCallback, useEffect, useRef } from "react";
import {
    ICardInfo,
    getCardDefaultTrainedStatus,
    getRarityNumber,
    isTrainableCard,
} from "@/types/types";
import { getCardThumbnailUrl } from "@/lib/assets";
import { useTheme, type AssetSourceType } from "@/contexts/ThemeContext";
import { registerTouchEndCleanup } from "./cardTouchFocus";
import styles from "./SekaiCardThumbnail.module.css";

interface SekaiCardThumbnailProps {
    card: ICardInfo;
    trained?: boolean;
    mastery?: number;
    width?: number; // Default 156
    className?: string;
    assetSource?: AssetSourceType;
    /** Hover/touch flips between pre-trained and post-trained art for trainable cards. */
    hoverSwitch?: boolean;
}

function SekaiCardThumbnail({
    card,
    trained,
    mastery = 0,
    width = 156,
    className = "",
    assetSource: customAssetSource,
    hoverSwitch = false,
}: SekaiCardThumbnailProps) {
    const { assetSource: themeAssetSource } = useTheme();
    const assetSource = customAssetSource ?? themeAssetSource;
    const [failedUrls, setFailedUrls] = React.useState<Record<string, true>>({});
    const rootRef = useRef<HTMLDivElement>(null);
    const cleanupTouchRef = useRef<(() => void) | null>(null);
    // Card grids render many of these; a literal id would collide and every
    // clipPath reference would resolve to the first instance in the document.
    const clipId = `cardClip-${React.useId()}`;

    // Determine trained status
    // Logic: If trained prop is provided, use it. Otherwise, default to false (normal).
    // Note: The parent component should handle the logic for "display trained if available".
    // For 1/2 star cards, trained is always false.
    // For 3/4 star cards, it can be true or false.
    // Birthday cards are effectively "trained" for the sake of assets usually, but rarity_birthday handles it.
    const isTrained = trained ?? false;

    // Rarity handling
    const rarityNumber = getRarityNumber(card.cardRarityType);
    const isBirthday = card.cardRarityType === "rarity_birthday";
    const canHoverSwitch =
        hoverSwitch &&
        isTrainableCard(card) &&
        !isBirthday &&
        !getCardDefaultTrainedStatus(card);

    // Asset Paths ( Local proxy to Official Assets )
    // Base URL for local assets: /data/sekai_cards_assets/
    const ASSET_BASE = "/data/sekai_cards_assets";

    // 1. Card Image
    const cardImageUrl = getCardThumbnailUrl(
        card.characterId,
        card.assetbundleName,
        isTrained,
        assetSource
    );
    const altCardImageUrl = canHoverSwitch
        ? getCardThumbnailUrl(card.characterId, card.assetbundleName, !isTrained, assetSource)
        : null;
    const imageError = Boolean(failedUrls[cardImageUrl]);
    const altImageError = altCardImageUrl ? Boolean(failedUrls[altCardImageUrl]) : true;

    const markFailed = (url: string) => {
        setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
    };

    const clearTouchFlip = useCallback(() => {
        if (rootRef.current) delete rootRef.current.dataset.touchFlipped;
        cleanupTouchRef.current?.();
        cleanupTouchRef.current = null;
    }, []);

    useEffect(() => clearTouchFlip, [clearTouchFlip]);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!canHoverSwitch || e.pointerType === "mouse") return;
        const el = rootRef.current;
        if (!el) return;
        el.dataset.touchFlipped = "true";
        registerTouchEndCleanup(cleanupTouchRef, clearTouchFlip);
    };

    // 2. Frame
    // frame_rarity_{rarity}.png
    // rarity is 1, 2, 3, 4, or birthday (mapped from rarity_*)
    const raritySuffix = isBirthday ? "birthday" : rarityNumber.toString();
    const frameUrl = `${ASSET_BASE}/frame_rarity_${raritySuffix}.png`;

    // 3. Attribute
    // icon_attribute_{attr}.png
    const attrUrl = `${ASSET_BASE}/attr_${card.attr}.png`;

    // 4. Stars
    // rare_star_{normal|after_training}.png
    // Birthday: rare_birthday.png
    const getStarUrl = (trainedState: boolean) =>
        isBirthday
            ? `${ASSET_BASE}/rare_birthday.png`
            : trainedState
                ? `${ASSET_BASE}/rare_star_after_training.png`
                : `${ASSET_BASE}/rare_star_normal.png`;
    const starUrl = getStarUrl(isTrained);
    const altStarUrl = canHoverSwitch ? getStarUrl(!isTrained) : null;

    // 5. Mastery
    // train_rank_{mastery}.png (0-5)
    // Only show if mastery > 0
    const masteryUrl = mastery > 0 ? `${ASSET_BASE}/train_rank_${mastery}.png` : null;

    // Layout Constants (Base 156x156)
    const BASE_SIZE = 156;
    const ATTR_SIZE = 35; // 35x35
    const MASTERY_SIZE = 56; // 56x56
    const MASTERY_POS = { x: 100, y: 100 };

    // Star Layout
    // Start (5, 125), gap 24
    const STAR_START_X = 5;
    const STAR_Y = 125;
    const STAR_GAP = 24;
    // User note says the spacing is 24px. If gap is 24, star width should be <= 24? 
    // Actually usually the stride is 24.
    // Let's assume size is roughly 24x24 or slightly less.
    // Checking SekaiCard.vue reference: <image ... width="23" height="23" ... /> or similar?
    // User didn't specify star size, only position and gap.
    // Let's use 24x24 as a safe bet for now, or maybe 22x22.

    const starCount = isBirthday ? 1 : rarityNumber;

    const renderStars = (href: string) => {
        if (isBirthday) {
            // Birthday star fixed at (10, 125)
            // Note: User said "Birthday star ... fixed at (10, 125)"
            return (
                <image
                    href={href}
                    x="10"
                    y="125"
                    width="24"
                    height="24" // Estimating size
                />
            );
        }

        return Array.from({ length: starCount }).map((_, index) => (
            <image
                key={index}
                href={href}
                x={STAR_START_X + index * STAR_GAP}
                y={STAR_Y}
                width="24" // Estimating size
                height="24"
            />
        ));
    };

    return (
        <div
            ref={rootRef}
            onPointerDown={handlePointerDown}
            onPointerUp={clearTouchFlip}
            onPointerCancel={clearTouchFlip}
            onPointerLeave={clearTouchFlip}
            className={`relative ${className ? "" : "inline-block"} select-none ${canHoverSwitch ? styles.interactive : ""} ${className}`}
            style={className ? { aspectRatio: '1 / 1' } : { width, height: width }}
        >
            <svg
                viewBox={`0 0 ${BASE_SIZE} ${BASE_SIZE}`}
                width="100%"
                height="100%"
                xmlns="http://www.w3.org/2000/svg"
                className="drop-shadow-sm"
            >
                {/* 1. Card Image */}
                {/* Use a mask or clipPath if needed, but usually the frame covers edges. 
                    Official implementation might mask it. For now, simple image. */}
                {/* 
                    Note: Safari/iOS sometimes has issues with <image> inside <svg> if not handled carefully with href/xlinkHref. 
                    React handles this usually.
                 */}
                <defs>
                    <clipPath id={clipId}>
                        <rect x="2" y="2" width="152" height="152" rx="10" ry="10" />
                    </clipPath>
                </defs>

                {/* Background placeholder */}
                <rect width="156" height="156" fill="#f0f0f0" rx="12" />

                <image
                    href={imageError ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23f0f0f0' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999'%3E...%3C/text%3E%3C/svg%3E" : cardImageUrl}
                    x="2"
                    y="2"
                    width="152"
                    height="152"
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#${clipId})`}
                    onError={() => markFailed(cardImageUrl)}
                />

                {altCardImageUrl && !altImageError && (
                    <g className={styles.altLayer}>
                        <image
                            href={altCardImageUrl}
                            x="2"
                            y="2"
                            width="152"
                            height="152"
                            preserveAspectRatio="xMidYMid slice"
                            clipPath={`url(#${clipId})`}
                            onError={() => markFailed(altCardImageUrl)}
                        />
                    </g>
                )}

                {/* 2. Frame */}
                {/* Frames usually include the rounded corners and border */}
                <image
                    href={frameUrl}
                    x="0"
                    y="0"
                    width="156"
                    height="156"
                />

                {/* 3. Attribute */}
                {/* Top Left */}
                <image
                    href={attrUrl}
                    x="0"
                    y="0"
                    width={ATTR_SIZE}
                    height={ATTR_SIZE}
                />

                {/* 4. Stars */}
                {altStarUrl ? (
                    <>
                        <g className={styles.baseStarLayer}>{renderStars(starUrl)}</g>
                        <g className={styles.altLayer}>{renderStars(altStarUrl)}</g>
                    </>
                ) : (
                    renderStars(starUrl)
                )}

                {/* 5. Mastery/Break Rank */}
                {masteryUrl && (
                    <image
                        href={masteryUrl}
                        x={MASTERY_POS.x}
                        y={MASTERY_POS.y}
                        width={MASTERY_SIZE}
                        height={MASTERY_SIZE}
                    />
                )}
            </svg>
        </div>
    );
}

export default memo(SekaiCardThumbnail);
